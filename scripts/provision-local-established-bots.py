"""Provision separate, unprivileged portal fixtures for the established synthetic local bots."""
import json,subprocess
from pathlib import Path
bots=json.loads((Path(__file__).resolve().parents[2]/'bmoremedtech/.local/bots/medtech-local-bots.json').read_text())['bots']
code='''import sys,json,asyncio
sys.path.insert(0,"/app")
from urllib.parse import urlsplit
from config import settings
from db import SessionLocal,engine
from models import User,WebsiteUser,Website
from security import hash_password,verify_password
from sqlalchemy import select
assert settings.env=='dev' and urlsplit(settings.public_base_url).hostname=='localhost'
async def main():
 async with SessionLocal() as s:
  website=(await s.execute(select(Website).where(Website.slug==settings.portal_sso_app_slug))).scalar_one()
  for i,b in enumerate(json.load(sys.stdin)):
   assert b['email'].startswith('medtech-local-verified-bot-') and b['email'].endswith('@example.com') and b.get('email_verified')
   owner=(await s.execute(select(User).where(User.email==b['email']))).scalar_one()
   assert owner.is_active and verify_password(b['password'],owner.hashed_password)
   member=(await s.execute(select(WebsiteUser).where(WebsiteUser.website_id==website.id,WebsiteUser.email==b['email']))).scalar_one_or_none()
   if not member:
    member=WebsiteUser(website_id=website.id,email=b['email'],full_name=b['full_name'],hashed_password=hash_password(b['password']),is_active=True,identity_data={'email_verified':True,'local_test_bot':True})
    s.add(member);await s.flush()
   assert member.identity_data.get('local_test_bot') and verify_password(b['password'],member.hashed_password)
   assert member.id!=owner.id
  await s.commit()
  print('Provisioned 3 explicit local portal-member bot fixtures; primary accounts, links and permissions unchanged')
 await engine.dispose()
asyncio.run(main())'''
r=subprocess.run(['docker','exec','-i','lifetech-identity-api','/venv/bin/python','-c',code],input=json.dumps(bots),text=True,capture_output=True)
if r.returncode:print('Local fixture provisioning failed');raise SystemExit(1)
print(r.stdout)
