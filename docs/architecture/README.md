# Architecture

[All documentation](../README.md) | [Path map and migration audit](../architecture/documentation_path_map.md)

System boundaries, authoritative data, messaging and city design. The existing Node API and Python messaging service remain distinct.

Documents are stored in their primary topic directories. Related service and deployment runbooks remain beside the systems they describe.

| Document |
| --- |
| [modular_monorepo_migration_plan.md](modular_monorepo_migration_plan.md): Phases A and B are under way |
| [external_voxel_repositories_adoption_plan.md](external_voxel_repositories_adoption_plan.md): selective implementation plan, project structure changes, licensing boundaries, and GAP analysis |
| [adr/0001-shared-package-boundaries.md](adr/0001-shared-package-boundaries.md): the shared packages, what each may import, the adapters, contract versioning and CI |
| [adr/0002-workspaces.md](adr/0002-workspaces.md): Phase C step 1, npm workspaces, imports by `@voxelventure/*` name, the adapters retired |
| [../../packages/README.md](../../packages/README.md): the shared packages and their contracts |
| [authoritative_data.md](authoritative_data.md) |
| [backend.md](backend.md) |
| [chat_messaging_plan.md](chat_messaging_plan.md) |
| [city_editor.md](city_editor.md) |
| [day_night_sound.md](day_night_sound.md) |
| [infill_and_land.md](infill_and_land.md) |
| [kenney_assets.md](kenney_assets.md) |
| [live_data.md](live_data.md) |
| [node_fastapi_architecture_plan.md](node_fastapi_architecture_plan.md) |
| [presence_scale.md](presence_scale.md) |
| [road_design_reference.md](road_design_reference.md) |
| [street_names.md](street_names.md) |
| [study_world_streaming.md](study_world_streaming.md) |
| [Documentation path map](documentation_path_map.md) |
