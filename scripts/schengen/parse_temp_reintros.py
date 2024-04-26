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

ISO_COUNTRY_CODES = {
    'Austria': 'AT',
    'Belgium': 'BE',
    'Czech Republic': 'CZ',
    'Czechia': 'CZ',
    'Denmark': 'DK',
    'Estonia': 'EE',
    'Finland': 'FI',
    'France': 'FR',
    'Germany': 'DE',
    'Hungary': 'HU',
    'Iceland': 'IS',
    'Italy': 'IT',
    'Latvia': 'LV',
    'Lithuania': 'LT',
    'Malta': 'MT',
    'Netherlands': 'NL',
    'Norway': 'NO',
    'Poland': 'PL',
    'Portugal': 'PT',
    'Slovakia': 'SK',
    'Slovenia': 'SI',
    'Spain': 'ES',
    'Sweden': 'SE',
    'Switzerland': 'CH'
}

def is_ids_line(line):
    return re.match(r'^\d+ ?(-\d+)?$', line)

def parse_ids(line):
    id_range = list(map(int, map(lambda token: token.strip(), line.split('-'))))
    if len(id_range) == 1:
        return [id_range[0]]
    return list(range(id_range[0], id_range[1] + 1))

def is_duration_line(line):
    if re.match(r'^\d{1,2}/\d{1,2}', line):
        return True
    
    if re.match(r'\d{1,2}-\d{1,2}/\d{1,2}', line):
        return True
    
    return False

def parse_duration(start, end):
    return start, end

def parse_durations(lines):
    durations_str = ' '.join(lines)
    durations_str = re.sub(r' ?- ?', '-', durations_str)
    durations_str = re.sub(r' ?/ ?', '/', durations_str)

    durations = []

    def parse_match_duration(match):
        duration_str = match.group(0)
        start = match.group('start')
        end = match.group('end').replace('-', '/')
        start, end = parse_duration(start, end)

        durations.append({
            'raw': duration_str,
            'start': start,
            'end': end
        })

    if re.match(r'^\d{2}/\d{2}/\d{4}$', durations_str):
        start = durations_str
        end = durations_str
        start, end = parse_duration(start, end)
        durations.append({
            'raw': durations_str,
            'start': start,
            'end': end
        })
    else:
        for match in re.finditer(r'(?P<start>\d{1,2}(?:/\d{1,2})?(?:/\d{4})?/?)-(?P<end>(?:\d{1,2}/)?\d{1,2}[/-]\d{3,4})', durations_str):
            parse_match_duration(match)
            
        for match in re.finditer(r'(?P<start>\d{2}/\d{2}/\d{4}, \d{1,2}h)-(?P<end>\d{1,2}:\d{2})', durations_str):
            parse_match_duration(match)
            
        for match in re.finditer(r'(?P<start>\d{2}/\d{2}/\d{4}, \d{1,2}h\d{2})--(?P<end>\d{2}/\d{2}/\d{4}, \d{1,2}h\d{2})', durations_str):
            parse_match_duration(match)
        
    if len(durations) == 0:
        raise ValueError(f'No durations found: {durations_str}')
    
    return durations

def parse_reason(lines):
    return '\n'.join(lines)

def get_records_data_for_lines(lines):
    i = 0

    ids = parse_ids(lines[i])
    i += 1

    country = lines[i]
    country_code = ISO_COUNTRY_CODES.get(country)
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
        'country': {
            'name': country,
            'code': country_code
        },
        'durations': durations,
        'reason': reason
    }

def parse_records(records_data):
    if len(records_data['ids']) == 1:
        return [{
            'id': records_data['ids'][0],
            'country': records_data['country'],
            'durations': records_data['durations'],
            'reason': records_data['reason']
        }]

    id_duration_pairs = zip(records_data['ids'], records_data['durations'])

    records = []
    for id, duration in id_duration_pairs:
        records.append({
            'id': id,
            'country': records_data['country'],
            'durations': [duration],
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