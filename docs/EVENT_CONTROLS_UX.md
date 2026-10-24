# Event controls

Guidance consulted: GOV.UK Design System [buttons](https://design-system.service.gov.uk/components/button/), [tabs](https://design-system.service.gov.uk/components/tabs/), [checkboxes](https://design-system.service.gov.uk/components/checkboxes/) and [spacing](https://design-system.service.gov.uk/styles/spacing/).

Use sentence-case, action-specific application labels and align actions left. Keep the manager-only checkbox beside its label, separate from attendee actions. Avoid an extra card or heading for two application links. Use consistent 10/15/25px spacing and a single baseline for related section tabs. An underline and font weight identify the active tab without making navigation compete with the gold application action. Preserve existing tab keyboard behavior and visible focus. Stack application actions on narrow screens.

This applies the interaction and hierarchy guidance to LifeTech's existing visual identity; it does not adopt GOV.UK branding. Confirm appearance in both themes and mobile/desktop captures, and verify routes and controls through the distributed visual suite.

## Historical hierarchy review

These are design traditions and guidance, not universal or legally binding standards:

- **New Typography, 1920s–1930s:** Jan Tschichold's 1928 *Die Neue Typographie* codified an approach that organized type and imagery into purposeful compositions. The lesson here is to establish reading order and alignment before embellishing controls. [MoMA](https://www.moma.org/calendar/exhibitions/1013)
- **Swiss grid, 1950s onward:** consistent spatial relationships provide an underlying structure across unlike elements. A grid is an alignment framework, not a requirement to draw a box around every region. [Poster House](https://swissgrid.posterhouse.org/)
- **Editorial typography:** fewer heading levels and restrained differences communicate structure more clearly than stacking capitals, bold, color and borders. Keep a heading closer to the content it introduces than to the preceding section. [Butterick: headings](https://practicaltypography.com/headings.html), [spacing](https://practicaltypography.com/space-above-and-below.html)
- **Continuing information-design practice:** left alignment and minimal simultaneous emphasis preserve legibility and hierarchy. [IBM type basics](https://www.ibm.com/design/language/typography/type-basics/)
- **Perceptual grouping:** proximity and enclosure communicate relationships; enclosure can incorrectly imply that unrelated settings and attendee actions form one task. [NN/g visual hierarchy](https://www.nngroup.com/articles/visual-hierarchy-ux-definition/)

### Assessment of this event page

The first revision increased hierarchy noise by adding another heading and card around two actions. Removing that panel is justified, but it is not a complete hierarchy correction.

The intended order is: event identity; date, time and location; application actions; section navigation; section content; supporting information. Manager settings should sit with event management rather than precede attendee actions in the public-content flow. This is a proposed ordering based on the reviewed guidance, not a claim that historical sources prescribe event-page anatomy.

The description currently layers “About the event”, “What to expect”, and a heading supplied by event content. Prefer one meaningful section heading and subordinate content headings. Decorative labels must not compete with actual section headings. Preserve authored content and semantic heading order when implementing this simplification.

Use size and weight for the principal type hierarchy, proximity for grouping, and brand color selectively for actions and state. Keep supporting text readable; subordinate does not mean low contrast. Retain focus indicators, keyboard-operable tabs, and sufficient target sizes. Historical print conventions do not supersede web accessibility.

### Review criteria

- At a glance, can a reader identify the event, practical details and next action?
- Do neighboring elements have a genuine relationship, and do enclosing boundaries imply the right group?
- Is each heading visually attached to the content it introduces?
- Are manager-only settings distinguishable from attendee tasks?
- Does the structure remain clear without color, and with a narrow viewport?
- Do full-page and cropped views tell the same story? Passing screenshots, type checks and distributed tests establish rendering/behavior; they do not establish aesthetic quality or usability.
