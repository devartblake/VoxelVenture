# Architecture

[All documentation](../README.md) | [Path map and migration audit](../architecture/documentation_path_map.md)

System boundaries, authoritative data, presence, messaging, the migration and adoption plans, and the ADRs. The existing Node API and Python messaging service remain distinct. The city's own systems (roads, land, street names, sound, models, the city editor) are in [world/](../world/README.md) since 2026-10-18.

Documents are stored in their primary topic directories. Related service and deployment runbooks remain beside the systems they describe.

| Document |
| --- |
| [modular_monorepo_migration_plan.md](modular_monorepo_migration_plan.md): Phases A to D done (status at the top) |
| [external_voxel_repositories_adoption_plan.md](external_voxel_repositories_adoption_plan.md): selective implementation plan, project structure changes, licensing boundaries, and GAP analysis |
| [adr/0001-shared-package-boundaries.md](adr/0001-shared-package-boundaries.md): the shared packages, what each may import, the adapters, contract versioning and CI |
| [adr/0002-workspaces.md](adr/0002-workspaces.md): Phase C step 1, npm workspaces, imports by `@voxelventure/*` name, the adapters retired |
| [adr/0003-apps-and-services.md](adr/0003-apps-and-services.md): Phase C steps 2 to 5, the app in `apps/web/`, the API and the presence server in `services/` |
| [adr/0004-presence-protocol-contracts.md](adr/0004-presence-protocol-contracts.md): the presence protocol as executable contracts (adoption plan Track B) |
| [performance_policy.md](performance_policy.md): the capability and quality policy, frame-loop inventory, budgets and device measurement (adoption plan Track C) |
| [../../tests/journeys/README.md](../../tests/journeys/README.md): the business journeys and their shared agents (adoption plan Track A) |
| [../../packages/README.md](../../packages/README.md): the shared packages and their contracts |
| [authoritative_data.md](authoritative_data.md) |
| [backend.md](backend.md) |
| [chat_messaging_plan.md](chat_messaging_plan.md) |
| [live_data.md](live_data.md) |
| [node_fastapi_architecture_plan.md](node_fastapi_architecture_plan.md) |
| [presence_scale.md](presence_scale.md) |
| [Documentation path map](documentation_path_map.md) |
