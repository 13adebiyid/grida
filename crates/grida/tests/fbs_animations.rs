use grida::io::generated::grida::grida as fbs;
use grida::io::io_grida_fbs;

#[test]
fn decodes_native_animation_repository() {
    let mut builder = flatbuffers::FlatBufferBuilder::new();
    let id = builder.create_string("build-2");
    let scene = builder.create_string("scene-1");
    let target = builder.create_string("title-1");
    let dependency = builder.create_string("build-1");
    let dependencies = builder.create_vector(&[dependency]);
    let cue = builder.create_string("cue-2");
    let track = fbs::AnimationTrack::create(
        &mut builder,
        &fbs::AnimationTrackArgs {
            property: fbs::AnimationProperty::Opacity,
            from_value: 0.0,
            to_value: 1.0,
        },
    );
    let tracks = builder.create_vector(&[track]);
    let clip = fbs::AnimationClip::create(
        &mut builder,
        &fbs::AnimationClipArgs {
            id: Some(id),
            scene_id: Some(scene),
            target_node_id: Some(target),
            phase: fbs::AnimationPhase::Enter,
            trigger: fbs::AnimationTrigger::AfterPrevious,
            depends_on: Some(dependencies),
            order: 2,
            delay_seconds: 0.25,
            duration_seconds: 0.75,
            easing: fbs::AnimationEasing::EaseOut,
            fill: fbs::AnimationFill::Both,
            iterations: 1,
            tracks: Some(tracks),
            media_action: fbs::AnimationMediaAction::None,
            media_value: 0.0,
            cue_id: Some(cue),
        },
    );
    let animations = builder.create_vector(&[clip]);
    let schema = builder.create_string(io_grida_fbs::SCHEMA_VERSION);
    let document = fbs::CanvasDocument::create(
        &mut builder,
        &fbs::CanvasDocumentArgs {
            schema_version: Some(schema),
            animations: Some(animations),
            ..Default::default()
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
    let animation = decoded.animations.first().expect("animation");
    assert_eq!(animation.id, "build-2");
    assert_eq!(animation.scene_id, "scene-1");
    assert_eq!(animation.target_node_id.as_deref(), Some("title-1"));
    assert_eq!(animation.depends_on, vec!["build-1"]);
    assert_eq!(animation.trigger, fbs::AnimationTrigger::AfterPrevious);
    assert_eq!(animation.order, 2);
    assert_eq!(animation.delay_seconds, 0.25);
    assert_eq!(animation.duration_seconds, 0.75);
    assert_eq!(animation.easing, fbs::AnimationEasing::EaseOut);
    assert_eq!(animation.fill, fbs::AnimationFill::Both);
    assert_eq!(animation.cue_id.as_deref(), Some("cue-2"));
    assert_eq!(animation.tracks.len(), 1);
    assert_eq!(
        animation.tracks[0].property,
        fbs::AnimationProperty::Opacity
    );
    assert_eq!(animation.tracks[0].from, 0.0);
    assert_eq!(animation.tracks[0].to, 1.0);
}
