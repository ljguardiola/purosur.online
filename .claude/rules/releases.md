# Releases

The cloud service and the register app are two independently versioned deliverables: `cloud-vX.Y.Z` and `pos-vX.Y.Z`. A merge to `main` that changes the cloud deploys it to staging automatically once its Verify run passes; one that changes the register or a package it uses builds the register's staging installer, kept as an artifact of that run.
