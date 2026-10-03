#!/usr/bin/env python3
"""Offline face-region suggestions. Does not identify or match people."""
import argparse
import json
import os
from pathlib import Path
import sys


def detect(path, max_side=1600):
    os.environ['OPENCV_IO_MAX_IMAGE_PIXELS'] = '16000000'
    import cv2
    import numpy as np
    if path.stat().st_size > 32 * 1024 * 1024:
        raise ValueError('Image exceeds 32 MB.')
    # Decode a bounded thumbnail; never send images to a service.
    with path.open('rb') as source:
        encoded = source.read(32 * 1024 * 1024 + 1)
    if len(encoded) > 32 * 1024 * 1024:
        raise ValueError('Image exceeds 32 MB.')
    try:
        image = cv2.imdecode(np.frombuffer(encoded, dtype=np.uint8), cv2.IMREAD_REDUCED_COLOR_4)
    except cv2.error as error:
        raise ValueError('Image could not be decoded within the image limits.') from error
    if image is None:
        raise ValueError('Image could not be decoded.')
    height, width = image.shape[:2]
    if height * width > 16_000_000:
        raise ValueError('Decoded image is too large.')
    scale = min(1.0, max_side / max(width, height))
    if scale < 1:
        image = cv2.resize(image, (round(width * scale), round(height * scale)))
    height, width = image.shape[:2]
    cascade = cv2.CascadeClassifier(str(Path(cv2.data.haarcascades) / 'haarcascade_frontalface_default.xml'))
    if cascade.empty():
        raise RuntimeError('Bundled face detector is unavailable.')
    boxes = cascade.detectMultiScale(cv2.cvtColor(image, cv2.COLOR_BGR2GRAY), scaleFactor=1.1, minNeighbors=5, minSize=(24, 24))
    return {'schema': 1, 'regions': [{'x': int(x)/width, 'y': int(y)/height, 'width': int(w)/width, 'height': int(h)/height} for x, y, w, h in boxes], 'reviewRequired': True}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('image', type=Path)
    args = parser.parse_args()
    try:
        print(json.dumps(detect(args.image), indent=2))
    except (OSError, ValueError, RuntimeError, ImportError) as error:
        print(str(error), file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
