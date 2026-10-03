# Photo people tags and local face-region suggestions

OrgPortal stores manually entered public people labels separately from the original photos. Event galleries and organization galleries use stable media IDs; the homepage carousel uses Drive file IDs. Labels are isolated by portal tenant. The source images remain in their existing storage.

Gallery owners, administrators, and existing portal operators can edit tags. Each change requires a preview receipt and explicit confirmation, with live permission checks at both requests. Anonymous visitors can read the tags for a public gallery photo. Removing names uses the same reviewed save flow. Tags are labels, not identity-account links or membership grants.

Apply `org-worker/migrations/0054_photo_tags.sql` through the existing shared portal release path. Release the API and event gallery UI from CodeCollective, then the MedTech/LifeTech homepage presentation from its own repository. The local implementation is not evidence of a live deployment.

The API is `/api/photo-tags/{source}/{owner}/{photo}`. `source` is `event`, `organization`, or `carousel`; the owner is the event/organization ID or `medtech-photos` carousel ID. GET returns `{tags,canEdit}`. POST `{tags:[{label:"Alex"}],confirm:false}` returns a ten-minute preview receipt. POST the identical tags with `confirm:true` and that `previewId` to apply. An optional `region` contains normalized `x,y,width,height` values bounded to the image. Names require human entry and review. No face embeddings or identification fields are accepted.

## Offline face detection

Use Python 3.10 or later on a local machine:

```sh
python -m venv .venv-photo-detection
.venv-photo-detection/bin/pip install -r tools/photo-detection-requirements.txt
.venv-photo-detection/bin/python tools/detect-photo-faces.py /path/to/photo.jpg > regions.json
```

Package installation needs internet access. Detection itself runs offline with the OpenCV bundled frontal-face cascade. It outputs candidate normalized regions and a `reviewRequired` flag, without uploading the photo, creating a named identity, or comparing photos. The output does not automatically modify the gallery. A reviewer can add a name and use a region in the normal preview/apply flow.

This detector is a lightweight suggestion tool: it can miss turned, small, or obscured faces and return false positives. Human review is required. It does not offer face recognition, same-person matching, or face-based clustering. Inputs are limited to 32 MB and 16 million pixels. Outputs contain no names and do not include the local filename.
