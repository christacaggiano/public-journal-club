# Sample papers

Two papers to try the app with, chosen to sit at opposite ends of the evidence scale. Upload either one on the home page (or at `http://localhost:3000` when running locally) and compare the reviews.

| | Paper | Design | Why it's here |
| --- | --- | --- | --- |
| Stronger evidence | Takahashi K, et al. "Aspirin Omission at the Time of Primary Percutaneous Coronary Intervention in STEMI." *N Engl J Med* 2026. [doi:10.1056/NEJMoa2606997](https://doi.org/10.1056/NEJMoa2606997) | Multicentre randomized trial, 2,216 patients | A large, preregistered trial in a top journal. Its main hypothesis was not supported, so it also tests whether a review reports a negative result fairly. |
| Weaker evidence | Calabrese L. "Remission of OCD and ulcerative colitis with a ketogenic diet: Case Report." *Front Psychiatry* 2025;16:1541414. [doi:10.3389/fpsyt.2025.1541414](https://doi.org/10.3389/fpsyt.2025.1541414) | Single-patient case report | A striking claim from one patient with no comparison group, the kind of paper that circulates on social media. |

## Getting the PDFs

- **Case report:** included here as [`calabrese-2025-ketogenic-diet-ocd-case-report.pdf`](calabrese-2025-ketogenic-diet-ocd-case-report.pdf). It is open access under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) and is redistributed unmodified.
- **NEJM trial:** not included, because the article is copyrighted by the Massachusetts Medical Society and can't be redistributed. Download the PDF from the DOI link above (NEJM may ask you to sign in or subscribe).

## What to look for

Compare the two reviews on these points. The scores come from the rubric in [`config/rubric.json`](../config/rubric.json), explained in [`docs/METHODS.md`](../docs/METHODS.md).

1. **Study design badge and cap.** The trial should be classed as a randomized trial and the case report as a case report. For a causal claim, "Evidence for the main claim" is capped at 4.5 for a single randomized trial and 1.5 for a case report, however well either is written.
2. **Overreach.** Check whether the review flags the case report's main claim as going beyond what one patient can show.
3. **Negative result.** The trial did not show that dropping aspirin was safe (it was not noninferior on death, stroke or heart attack), though major bleeding was lower. A fair review says so plainly and doesn't spin either finding.
4. **Conflicts of interest.** The trial was funded by a device maker (Boston Scientific Japan). The case report's author runs the clinic that delivered the diet. See how each shows up in "Risk of slanted reporting".
5. **Highlights.** Click a highlight in the paper to jump to its explanation, and open "How we checked" on any note that recomputes a number.

Reviews are written by AI and can contain mistakes. Neither paper is medical advice.
