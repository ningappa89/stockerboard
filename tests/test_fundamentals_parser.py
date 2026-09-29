import importlib.util
import unittest
from pathlib import Path
spec = importlib.util.spec_from_file_location('refresh', Path(__file__).resolve().parents[1] / 'scripts' / 'refresh_fundamentals.py')
refresh = importlib.util.module_from_spec(spec)
spec.loader.exec_module(refresh)

class RatioParserTest(unittest.TestCase):
    def test_missing_ratio_does_not_borrow_next_value(self):
        result = refresh.parse_ratios('''<ul id="top-ratios"><li><span class="name">Stock P/E</span></li><li><span class="name">ROE</span><span class="number">15</span></li></ul>''')
        self.assertIsNone(result['pe'])
        self.assertEqual(result['roe'], 15)
    def test_zero_negative_and_derived_book_multiple(self):
        result = refresh.parse_ratios('''<ul id="top-ratios"><li><span class="name">ROE</span><span class="number">0</span></li><li><span class="name">ROCE</span><span class="number">-2.1</span></li><li><span class="name">Current Price</span><span class="number">723</span></li><li><span class="name">Book Value</span><span class="number">375</span></li></ul>''')
        self.assertEqual(result['roe'],0)
        self.assertEqual(result['roce'],-2.1)
        self.assertEqual(result['pb'],1.93)
        self.assertEqual(result['pb_basis']['method'],'source_price / source_book_value')
    def test_source_structure_required(self):
        with self.assertRaises(ValueError): refresh.parse_ratios('<html>Unavailable</html>')
    def test_nonfinite_is_missing(self):
        self.assertIsNone(refresh.number('NaN'))
        self.assertIsNone(refresh.number('Infinity'))

if __name__ == '__main__': unittest.main()
