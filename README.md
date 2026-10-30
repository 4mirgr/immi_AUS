# MedPath — Medical Career Command Center

A lightweight, dependency-free Persian dashboard for managing Dr Amir Houshang Gerami's medical migration, CV, LinkedIn profile, and content plan.

## Run locally

```bash
cd /workspace/immi_AUS
python3 -m http.server 4173
```

Then open `http://localhost:4173` locally. The app has no build step or package dependencies.

## Validation

```bash
python3 -m http.server 4173
curl -f http://127.0.0.1:4173/
```

## Notes

- Replace all bracketed placeholders in the CV with verified information before use.
- Migration and medical-registration requirements change frequently; verify them with official regulators before applying or paying fees.
- Task completion is stored only in the browser's local storage.
