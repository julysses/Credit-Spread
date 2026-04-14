from loguru import logger


def configure_logging(level: str = "INFO", serialize: bool = True) -> None:
    logger.remove()
    logger.add(lambda msg: print(msg, end=""), level=level, serialize=serialize)
