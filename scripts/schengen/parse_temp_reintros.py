"""
parse_temp_reintros.py < [input_txt] > [output_json]

Parse the temporary reintroduction of border control data from the Schengen
Area. This data is available from the European Commission's website at:

https://home-affairs.ec.europa.eu/policies/schengen-borders-and-visa/schengen-area/temporary-reintroduction-border-control_en
"""
import datetime
import json
import pytz
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

IANA_COUNTRY_TIMEZONES = {
    'AT': pytz.timezone('Europe/Vienna'),
    'BE': pytz.timezone('Europe/Brussels'),
    'CH': pytz.timezone('Europe/Zurich'),
    'CZ': pytz.timezone('Europe/Prague'),
    'DE': pytz.timezone('Europe/Berlin'),
    'DK': pytz.timezone('Europe/Copenhagen'),
    'EE': pytz.timezone('Europe/Tallinn'),
    'ES': pytz.timezone('Europe/Madrid'),
    'FI': pytz.timezone('Europe/Helsinki'),
    'FR': pytz.timezone('Europe/Paris'),
    'HU': pytz.timezone('Europe/Budapest'),
    'IS': pytz.timezone('Atlantic/Reykjavik'),
    'IT': pytz.timezone('Europe/Rome'),
    'LT': pytz.timezone('Europe/Vilnius'),
    'LV': pytz.timezone('Europe/Riga'),
    'MT': pytz.timezone('Europe/Malta'),
    'NL': pytz.timezone('Europe/Amsterdam'),
    'NO': pytz.timezone('Europe/Oslo'),
    'PL': pytz.timezone('Europe/Warsaw'),
    'PT': pytz.timezone('Europe/Lisbon'),
    'SE': pytz.timezone('Europe/Stockholm'),
    'SI': pytz.timezone('Europe/Ljubljana'),
    'SK': pytz.timezone('Europe/Bratislava')
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

def parse_duration(start_raw, end_raw, country_code):
    tz = IANA_COUNTRY_TIMEZONES.get(country_code, pytz.utc)

    if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', end_raw):
        end_parsed = tz.localize(datetime.datetime.strptime(end_raw, '%d/%m/%Y'))

        if re.match(r'^\d{1,2}/\d{1,2}/\d{4}$', start_raw):
            start_parsed = tz.localize(datetime.datetime.strptime(start_raw, '%d/%m/%Y'))

            if start_raw == end_raw:
                end_parsed += datetime.timedelta(days=1)
            
            return start_parsed.isoformat(), end_parsed.isoformat()
        
        if re.match(r'^\d{1,2}/\d{1,2}/\d{2}$', start_raw):
            start_parsed = tz.localize(datetime.datetime.strptime(start_raw, '%d/%m/%y'))

            if start_raw == end_raw:
                end_parsed += datetime.timedelta(days=1)
            
            return start_parsed.isoformat(), end_parsed.isoformat()
        
        match = re.match(r'^(\d{1,2})$', start_raw)
        if match:
            try:
                day = int(match.group(1))
                start_parsed = end_parsed.replace(day=day)
                return start_parsed.isoformat(), end_parsed.isoformat()
            except ValueError:
                print(start_raw, end_raw)

        match = re.match(r'^(\d{1,2})/(\d{1,2})/?$', start_raw)
        if match:
            try:
                day = int(match.group(1))
                month = int(match.group(2))
                start_parsed = end_parsed.replace(day=day, month=month)
                return start_parsed.isoformat(), end_parsed.isoformat()
            except ValueError:
                print(start_raw, end_raw)

    if re.match(r'^\d{2}/\d{2}/\d{4}, \d{1,2}h$', start_raw):
        start_parsed = tz.localize(datetime.datetime.strptime(start_raw, '%d/%m/%Y, %Hh'))

        match = re.match(r'^(\d{1,2}):(\d{2})$', end_raw)
        if match:
            hour = int(match.group(1))
            minute = int(match.group(2))
            end_parsed = start_parsed.replace(hour=hour, minute=minute)
            return start_parsed.isoformat(), end_parsed.isoformat()

    if re.match(r'^\d{2}/\d{2}/\d{4}, \d{1,2}h\d{2}$', end_raw):
        end_parsed = tz.localize(datetime.datetime.strptime(end_raw, '%d/%m/%Y, %Hh%M'))

        if re.match(r'^\d{2}/\d{2}/\d{4}, \d{1,2}h\d{2}$', start_raw):
            start_parsed = tz.localize(datetime.datetime.strptime(start_raw, '%d/%m/%Y, %Hh%M'))
            return start_parsed.isoformat(), end_parsed.isoformat()
    
    return start_raw, end_raw


def parse_durations(lines, country_code):
    durations_str = ' '.join(lines)
    durations_str = re.sub(r' ?- ?', '-', durations_str)
    durations_str = re.sub(r' ?/ ?', '/', durations_str)

    durations = []

    def parse_match_duration(match):
        duration_str = match.group(0)
        start_raw = match.group('start')
        end_raw = match.group('end').replace('-', '/')
        start_parsed, end_parsed = parse_duration(start_raw, end_raw, country_code)

        durations.append({
            'raw': duration_str,
            'start': start_parsed,
            'end': end_parsed
        })

    if re.match(r'^\d{2}/\d{2}/\d{4}$', durations_str):
        start_raw = durations_str
        end_raw = durations_str
        start_parsed, end_parsed = parse_duration(start_raw, end_raw, country_code)
        durations.append({
            'raw': durations_str,
            'start': start_parsed,
            'end': end_parsed
        })
    else:
        for match in re.finditer(r'(?P<start>\d{1,2}(?:/\d{1,2})?(?:/\d{2,4})?/?)-(?P<end>(?:\d{1,2}/)?\d{1,2}[/-]\d{2,4})', durations_str):
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
    durations = parse_durations(lines_durations, country_code)

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
            'duration': records_data['durations'][0],
            'reason': records_data['reason']
        }]

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

records_data = list(map(get_records_data_for_lines, records_lines))
records = []
for record_data in records_data:
    records.extend(parse_records(record_data))

print(json.dumps(records, indent=2))