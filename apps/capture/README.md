# Leafora Capture

Application boundary for field evidence capture.

The capture application is responsible for producing evidence packages with:

- image or document payload;
- SHA-256 content hash;
- metadata hash;
- GPS/geohash data;
- device/app signature;
- capture timestamp;
- storage URI;
- on-chain anchor reference.

The public web app already prepares browser-side evidence hashes. This module is
reserved for the dedicated capture workflow and should share the same backend
and evidence schema.

