"""
parse_temp_reintros.py

Parse the temporary reintroduction of border control data from the Schengen
Area. This data is available from the European Commission's website at:

https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/schengen-area/temporary-reintroduction-border-control_en
"""
import datetime
import json
import re
import sys

def is_ids_line(line):
    return re.match(r'^\d+ ?(-\d+)?$', line)

def parse_ids(line):
    id_range = list(map(int, map(lambda token: token.strip(), line.split('-'))))
    if len(id_range) == 1:
        return [id_range[0]]
    return list(range(id_range[0], id_range[1] + 1))

def get_country_iso_code(country):
    # TODO: implement this
    return country

def is_duration_line(line):
    if re.match(r'^\d\d?/\d\d?', line):
        return True
    
    if re.match(r'\d\d?-\d\d?/\d\d?', line):
        return True
    
    return False

def parse_duration(duration_str):
    return duration_str

def parse_durations(lines):
   durations_str = ' '.join(lines).replace(' ', '')
   duration_strs = map(lambda s: s.strip(), durations_str.split(';'))
   return list(map(parse_duration, duration_strs))

def parse_reason(lines):
    return '\n'.join(lines)

def get_records_data_for_lines(lines):
    i = 0

    ids = parse_ids(lines[i])
    i += 1

    country = get_country_iso_code(lines[1])
    i += 1

    lines_durations = []
    while is_duration_line(lines[i]):
        lines_durations.append(lines[i])
        i += 1
    durations = parse_durations(lines_durations)

    lines_reason = lines[i:]
    reason = parse_reason(lines_reason)

    return {
        'ids': ids,
        'country': country,
        'durations': durations,
        'reason': reason
    }

def parse_records(records_data):
    id_duration_pairs = zip(records_data['ids'], records_data['durations'])

    records = []
    for id, duration in id_duration_pairs:
        records.append({
            'id': id,
            'country': records_data['country'],
            'duration': duration,
            'reason': records_data['reason']
        })

    return records 

i = 0
records_lines = []
for line in sys.stdin:
    line = line.strip().replace('\u2013', '-').replace('\u2014', '-')
    i += 1

    if i < 12:
        continue

    if line.startswith('EN'):
        continue

    if line.startswith('* In line with the Schengen Borders Code'):
        continue

    if is_ids_line(line):
        records_lines.append([])

    records_lines[-1].append(line)

records = list(map(get_records_data_for_lines, records_lines))
print(json.dumps(records, indent=2))