use grida::io::generated::grida::grida as fbs;
use grida::io::io_grida_fbs::{self, ExternalAssetKind};

#[test]
fn decodes_external_asset_repository_and_reader_floor() {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let digest_value = "a".repeat(64);
    let digest = builder.create_string(&digest_value);
    let mime = builder.create_string("video/mp4");
    let name = builder.create_string("Loop.mp4");
    let poster_value = "b".repeat(64);
    let poster = builder.create_string(&poster_value);
    let asset = fbs::ExternalAsset::create(
        &mut builder,
        &fbs::ExternalAssetArgs {
            digest: Some(digest),
            kind: fbs::ExternalAssetKind::Video,
            mime_type: Some(mime),
            display_name: Some(name),
            bytes: 153_000_000,
            width: 1920,
            height: 1080,
            duration_seconds: 12.5,
            poster_digest: Some(poster),
        },
    );
    let assets = builder.create_vector(&[asset]);
    let schema = builder.create_string(io_grida_fbs::SCHEMA_VERSION);
    let minimum = builder.create_string("0.91.1-beta+20260714");
    let document = fbs::CanvasDocument::create(
        &mut builder,
        &fbs::CanvasDocumentArgs {
            schema_version: Some(schema),
            nodes: None,
            scenes: None,
            external_assets: Some(assets),
            minimum_reader_version: Some(minimum),
        },
    );
    let root = fbs::GridaFile::create(
        &mut builder,
        &fbs::GridaFileArgs {
            document: Some(document),
        },
    );
    builder.finish(root, Some("GRID"));

    let decoded = io_grida_fbs::decode_with_id_map(builder.finished_data()).unwrap();
    assert_eq!(
        decoded.minimum_reader_version.as_deref(),
        Some("0.91.1-beta+20260714")
    );
    assert_eq!(
        decoded.schema_version.as_deref(),
        Some(io_grida_fbs::SCHEMA_VERSION)
    );
    let asset = decoded.external_assets.get(&digest_value).unwrap();
    assert_eq!(asset.kind, ExternalAssetKind::Video);
    assert_eq!(asset.bytes, 153_000_000);
    assert_eq!(asset.width, Some(1920));
    assert_eq!(asset.height, Some(1080));
    assert_eq!(asset.duration_seconds, Some(12.5));
    assert_eq!(asset.poster_digest.as_deref(), Some(poster_value.as_str()));
}
