# Heuristic aesthetic audit

Run `npm run test:ubuntu:heuristics` with the local containers and a desktop
session available. The audit uses the real native Electron app, captures six
public pages in dark/light at 1180/680 px, and produces:

- `../../../artifacts/lifetech-aesthetics/heuristics.html`: visual report with
  annotated screenshots, measurements, source links, and per-layout findings.
- `heuristics.json`: machine-readable findings and effective thresholds.
- `*-measurements.json`: raw DOM geometry and text samples for each capture.
- `*-guides.png`: thirds, golden-section, and heading focal-point overlays.

Exit status is nonzero for measured defects, such as horizontal overflow, broken
visible images, and confidently sampled contrast below its standard-based
threshold. Advisory composition and reading findings do not fail the run.
The audit does not silently change thresholds to make the app pass.

## Rubric and evidence

| Measure | Reference or threshold | Interpretation |
| --- | --- | --- |
| Thirds | Lines at 33.33% and 66.67% of content width/height | Informational composition cue; distance from heading-box center to nearest intersection. |
| Golden sections | Lines at 38.20% and 61.80% | Informational alternative; not an established optimum for interfaces. |
| Near an intersection | Normalized Euclidean distance at most 5% | Project convention, not a published scholarly threshold. |
| Occupied area / whitespace | Review whitespace outside 20–80% | Project guardrail. Union of clipped text-line, image, and control boxes; not pixel whitespace. |
| Left/right balance | Fraction of occupied area on each half | Research-inspired diagnostic, not optical weight or a symmetry requirement. |
| Alignment | Review if fewer than 70% of content blocks share a left edge within 4 px | Project convention. Nested/grouped layouts can inflate this proxy. |
| Spacing rhythm | Review if fewer than 80% of gaps/padding fit a 4 px scale, ±1 px | Project convention; proportional and fluid layouts can validly differ. |
| Prose line length | Review sampled lines over 80 characters | W3C AAA reading reference for Latin text; not a compliance verdict. |
| Prose leading | Review below 150% of font size | W3C AAA reading reference; does not test the required user-adjustment mechanism. |
| Sampled text contrast | 4.5:1 ordinary; 3:1 at least 24 px, or at least 18.67 px bold | W3C AA SC 1.4.3. Skips uncertain backgrounds/effects and disabled controls. |
| Overflow / visible image failures | No horizontal overflow or broken visible images | Concrete geometry/resource defects. |

[Hoh, Zhang & Dodgson (2023)](https://fanglue.github.io/papers/AsiaPoster.pdf)
found no general preference for thirds over centered single-object photographs.
This does not establish either as a web-layout rule. We show both composition
cues, with no third/golden pass gate and no combined beauty score.

[Ngo, Teo & Byrne (2003), Modelling interface aesthetics](https://doi.org/10.1016/S0020-0255(02)00404-8)
provides conceptual support for measuring balance, density, regularity, and
proportion. Our DOM measurements are practical proxies, not a reproduction or
validation of that paper's model. No universal percentage is attributed to it.

W3C references: [contrast minimum](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html)
and [visual presentation](https://www.w3.org/WAI/WCAG22/Understanding/visual-presentation.html).
This sampler is not a replacement for a full accessibility audit.

## Configuration

Set `ORGPORTAL_AESTHETIC_CONFIG=/absolute/path/to/config.json` to override project
review thresholds. Example:

```json
{
  "compositionTolerance": 0.05,
  "whitespaceMin": 0.20,
  "whitespaceMax": 0.80,
  "alignmentMin": 0.70,
  "spacingScaleMin": 0.80,
  "maxLineCharacters": 80,
  "minParagraphLeading": 1.5
}
```

Contrast thresholds remain tied to the cited standard. All percentages are
fractions in the configuration. Effective values appear in the JSON report.

## Limits

Measurements cover the visible content below the persistent header, not a
full-page composition. The heading-box center is a reproducible focal proxy,
not eye-tracking salience. Thirds distances use independently normalized x/y
coordinates, not physical pixel distances. Left-aligned reading interfaces can
be intentionally asymmetric. Missing focal headings produce N/A, never zero.

Contrast composites ancestor solid colors and alpha. Gradients, images, opacity,
filters, blending, disabled controls, and text outside the sample need manual
review. It does not determine every exception, occlusion, image contrast, or
state. Prose checks sample 12 visible paragraphs and at most 1200 characters each;
contrast samples at most 150 text-bearing elements. Text box density is not
perceptual complexity. Screenshot review and actual user testing remain needed.
