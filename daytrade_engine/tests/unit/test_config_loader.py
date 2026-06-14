from app.core.config_loader import ConfigLoader


def test_load_config_bundle():
    cfg = ConfigLoader('config').load()
    assert cfg.app.timezone == 'America/New_York'
