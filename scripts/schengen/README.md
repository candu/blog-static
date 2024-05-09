# Schengen Temporary Reintroduction of Border Control Data

## Scripts

- `parse_temp_reintros.py`: script to parse the Schengen Temporary Reintroduction of Border Control data from the raw text file into a JSON file

## Data Files

- `schengen.txt`: raw text copy-pasted out of the [Full list of notifications PDF](https://home-affairs.ec.europa.eu/document/download/11934a69-6a45-4842-af94-18400fd274b7_en?filename=Full-list-of-MS-notifications_en_0.pdf)
- `schengen_fixed.txt`: the same text, but with manual fixes to correct years on records #109, #41-44, #37-40, #33

Note that the original PDF is not included here, but is linked above.

## Usage

See `parse_temp_reintros.py` for usage instructions.

## Caveats

The original dataset is full of inconsistent date formats, especially in older entries. Timestamp parsing is best effort, and uses a _lot_ of regex magic.

All timestamps are assumed to be in the main timezone for the country in question (see `IANA_COUNTRY_TIMEZONES` in `parse_temp_reintros.py`). Some countries have outlying islands with different timezones, which are not accounted for here.
