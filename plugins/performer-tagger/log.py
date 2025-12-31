"""
Logging utilities for Stash plugins.
Log messages are transmitted via stderr with special prefix encoding.
"""
import sys


def __prefix(level_char):
    start_level_char = b'\x01'
    end_level_char = b'\x02'
    ret = start_level_char + level_char + end_level_char
    return ret.decode()


def __log(level_char, s):
    if level_char == "":
        return
    print(__prefix(level_char) + s + "\n", file=sys.stderr, flush=True)


def trace(s):
    """Log at trace level."""
    __log(b't', str(s))


def debug(s):
    """Log at debug level."""
    __log(b'd', str(s))


def info(s):
    """Log at info level."""
    __log(b'i', str(s))


def warning(s):
    """Log at warning level."""
    __log(b'w', str(s))


def error(s):
    """Log at error level."""
    __log(b'e', str(s))


def progress(p):
    """Report progress as a float between 0 and 1."""
    progress_val = min(max(0, p), 1)
    __log(b'p', str(progress_val))







