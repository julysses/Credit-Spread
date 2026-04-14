import argparse

p = argparse.ArgumentParser()
p.add_argument('--strategy', default='all')
a = p.parse_args()
print(f'run_backtest: {a.strategy}')
