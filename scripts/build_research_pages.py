"""Build company research entry pages using the shared shell and verified client loader."""
from pathlib import Path
import argparse

ROOT = Path(__file__).resolve().parents[1]


def build(check=False):
    # The adopted layouts are now versioned templates; do not restore the
    # earlier proof-of-concept markup or silently drop Peers and Filings.
    for name in ('company_overview','financials_tab','valuation_tab','peers_tab','filings_tab'):
        target=ROOT/f'stockerboard_{name}.html'
        expected=(ROOT/'templates/research'/target.name).read_bytes()
        if b'/scripts/research-data.js' not in expected:
            raise ValueError('Verified research loader missing: '+name)
        if check:
            if not target.exists() or target.read_bytes()!=expected:
                raise ValueError('Generated research page differs: '+target.name)
        else:
            target.write_bytes(expected)
    print('PASS: all five adopted research pages match versioned templates')
    return


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    build(parser.parse_args().check)
