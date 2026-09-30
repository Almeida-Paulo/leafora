# Project catalog and Leafora Capture

## Current publication flow

The curator creates a project draft in the admin panel. The fields shown on the
home page, the Projects catalog and the project page are name, category, biome,
public location label, cover image, expected impact, objective, story, risks and
milestones. The USDC goal and closing time are entered separately when the
administrator signs the Stellar publication. Raised USDC, supporter count and
funding availability come from the contract, never from the old SUI demo fields.

The current cover images are AI illustrations. They are presentation media, not
field evidence, and the public site labels them accordingly. The location label
is curated text, not a claim that the coordinates were measured by the app.

Stellar commits the stable project description. New publications use a metadata
hash that excludes the mutable cover URI. The metadata endpoint serves exactly
the committed fields. Projects published with the earlier hash, which included
the cover URI, remain readable; their cover URI stays locked. Do not publish a
project until its stable description has been checked, because those fields
cannot be edited afterward with the current contract.

## Capture-backed cover, when the integration exists

1. An authorized operator captures an original image in Leafora Capture for an
   existing project. The capture package binds the image hash, project identity,
   operator authorization, capture time, location fix and accuracy, app/device
   signature, and a unique capture identifier.
2. The API verifies the signature, authorization, content hash, time and
   location quality, and checks exact and near-duplicate evidence. It stores
   original media and precise coordinates privately. A server-side review and
   blockchain anchoring follow; neither an EXIF tag nor a submitted transaction
   ID is sufficient proof by itself.
3. A curator selects an approved, anchored evidence record belonging to the
   project as its cover. The public cover is a derived image linked to the
   immutable original and its hash. The choice and any later replacement get an
   audit record. A generic image URL must never be able to claim Capture status.
4. The public location is derived from the reviewed evidence only after a
   project-specific privacy decision. It may be a general area or short geohash,
   not the exact GPS coordinates. Do not overwrite an existing project's
   committed location label; a future georeferenced display is a separate,
   versioned presentation field.

The current API does **not** ingest or verify Leafora Capture packages. It must
not expose a "Capture verified" label or accept an arbitrary image as one.
The public evidence endpoint returns only approved records and excludes exact
coordinates, geohashes, media storage URIs and operator addresses. Its approval status is
currently a curatorial decision, not proof that a Capture package was verified.
The full Capture ingestion and on-chain verification pipeline remains future
work; never send Capture packages through the basic admin evidence endpoint.

The capture specification in `app-maker.md` defines the signed manifest,
authorization, GPS quality, privacy and duplicate-handling requirements. A
content hash establishes integrity, not the real-world truth of the scene;
curatorial and independent review remain separate.
