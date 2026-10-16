"""python -m app: runs the service with the settings in the environment (MESSAGING_HOST, MESSAGING_PORT, ...)."""
import uvicorn

from .config import Settings
from .main import create_app

cfg = Settings()
print(f'VoxelVenture messaging on {cfg.host}:{cfg.port} (database {cfg.db}, accounts from {cfg.node_url})', flush=True)
uvicorn.run(create_app(cfg), host=cfg.host, port=cfg.port, log_level='warning')
