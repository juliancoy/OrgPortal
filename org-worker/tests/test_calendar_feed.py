import importlib.util
from argparse import Namespace
import contextlib
import io
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

PORTAL = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(PORTAL.parent / 'CodeCollective'))
spec = importlib.util.spec_from_file_location('calendar_feed', PORTAL / 'org-worker/scripts/push_org_network_feed.py')
feed = importlib.util.module_from_spec(spec)
spec.loader.exec_module(feed)


class CalendarFeedTests(unittest.TestCase):
    def collect(self, raw):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            city = root / 'baltimore'
            city.mkdir()
            (city / 'event_sources.py').write_text("sources = [{'name': 'Columbia Association Events', 'url': 'https://columbiaassociation.org/events/calendar/'}]")
            (city / 'upcoming_events.json').write_text(json.dumps([raw]))
            return feed.collect_orgs_and_events(root, ['baltimore'])

    def test_embedded_calendar_links_to_registered_group_without_changing_identity(self):
        orgs, events = self.collect({
            'name': 'Public Ice Skating',
            'source': 'https://events.timely.fun/2akzl94r/month',
            'source_url': 'https://columbiaassociation.org/events/calendar/',
            'url': 'https://events.timely.fun/2akzl94r/event/78433845',
            'startDate': '2026-10-07T14:00:00+00:00',
        })
        event = events[0]
        self.assertEqual(len(orgs), 1)
        self.assertEqual(event['host_org_source_url'], orgs[0]['source_url'])
        self.assertEqual(event['host_org_name'], 'Columbia Association Events')
        self.assertEqual(event['ingest_key'], feed.build_ingest_key({
            **event, 'host_org_source_url': 'https://events.timely.fun/2akzl94r/month',
        }))
        self.assertEqual(event['source_url'], 'https://events.timely.fun/2akzl94r/event/78433845')

    def test_legacy_feed_without_canonical_source_still_links(self):
        _, events = self.collect({'name': 'Legacy event', 'source': 'https://legacy.example/events', 'source_group': 'Legacy Group'})
        self.assertEqual(events[0]['host_org_source_url'], 'https://legacy.example/events')
        self.assertEqual(events[0]['host_org_name'], 'Legacy Group')
        self.assertEqual(events[0]['ingest_key'], feed.build_ingest_key(events[0]))

    def test_canonical_source_without_scraper_source_keeps_identity(self):
        _, events = self.collect({'name': 'Canonical event', 'source_url': 'https://columbiaassociation.org/events/calendar/'})
        self.assertEqual(events[0]['ingest_key'], feed.build_ingest_key(events[0]))

    def test_parallel_event_batches_wait_for_all_organizations(self):
        organizations = [{'name': 'First group'}, {'name': 'Second group'}]
        events = [{'ingest_key': str(index)} for index in range(7)]
        args = Namespace(url='https://fixture.invalid', token='fixture', repo_root='.', cities=['baltimore'],
                         org_chunk_size=1, event_chunk_size=2, event_workers=4)
        imported_organizations = []
        imported_events = []

        def post(url, token, payload):
            if payload['batch_type'] == 'organizations':
                imported_organizations.extend(payload['organizations'])
            else:
                self.assertEqual(imported_organizations, organizations)
                imported_events.extend(payload['events'])
            return {'organizations': len(payload['organizations']), 'events': len(payload['events'])}

        with patch.object(feed, 'parse_args', return_value=args), \
             patch.object(feed, 'collect_orgs_and_events', return_value=(organizations, events)), \
             patch.object(feed, 'post_payload', side_effect=post), contextlib.redirect_stdout(io.StringIO()) as output:
            self.assertEqual(feed.main(), 0)
        self.assertCountEqual(imported_events, events)
        self.assertIn('"events": 7', output.getvalue())


if __name__ == '__main__':
    unittest.main()
