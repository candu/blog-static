"""
compute_guess_ngram_counts.py

Augment Wordle guess list with word frequency counts from Peter Norvig's
n-gram corpus (https://norvig.com/ngrams/count_1w.txt).

Usage:
    python scripts/adversarial-wordle/compute_guess_ngram_counts.py > output.csv
"""
import csv
import os.path
import sys
import urllib.request

WORDLE_GUESSES_PATH = os.path.join('.', 'wordle-guesses.csv')
NGRAMS_URL = 'https://norvig.com/ngrams/count_1w.txt'
DEFAULT_COUNT = 10000


def download_ngrams():
    """Download and parse n-gram data from Norvig's corpus.

    Returns:
        dict: Mapping of word (lowercase) to count
    """
    ngram_counts = {}

    with urllib.request.urlopen(NGRAMS_URL) as response:
        for line in response:
            line = line.decode('utf-8').strip()
            if not line:
                continue

            parts = line.split('\t')
            if len(parts) == 2:
                word = parts[0].lower()
                count = int(parts[1])
                ngram_counts[word] = count

    return ngram_counts


def read_wordle_guesses():
    """Read Wordle guess words from CSV file.

    Returns:
        list: List of words in order
    """
    words = []

    for line in sys.stdin:
        word = line.strip()
        if word:
            words.append(word)

    return words


def main():
    ngram_counts = download_ngrams()
    wordle_words = read_wordle_guesses()

    writer = csv.writer(sys.stdout)
    writer.writerow(['word', 'count'])

    for word in wordle_words:
        count = ngram_counts.get(word.lower(), DEFAULT_COUNT)
        writer.writerow([word, count])


if __name__ == '__main__':
    main()
