import { deploys, RATE_INTERVAL } from '../lib/dashboard.ts';
import { BUSINESS } from '../lib/folders.ts';
import type { DashboardSpec } from '../lib/model.ts';
import { atLeast, gauge, logs, stat, table, timeseries, under, valueMap, type Step } from '../lib/panels.ts';
import { loki, prom } from '../lib/queries.ts';

const JOBS = '{job=~"trading-bot-control-plane|trading-bot-market-data|trading-bot-execution|trading-bot-research-backtesting"}';

const WAITING_TRADES = 'Empty until trading-bot#167 merges and the execution container is rebuilt; the service starts both counters at zero for every loaded promotion, so after that a flat zero means no trade, not no metric.';

const WAITING_RUNS = 'Empty until trading-bot#167 merges and the research-backtesting container is rebuilt.';

const MODE = valueMap({ '0': ['live', 'red'], '1': ['paper', 'green'] });

const WEIGHT: Step[] = [
  { color: 'green', value: null },
  { color: 'orange', value: 0.8 },
  { color: 'red', value: 1 },
];

const CONFIGURATION = 'strategy_name, pair_code, timeframe_code, risk_profile_name';

const PIPELINE_LOG =
  'backtest.failed|backtest.batch_processed|backtest_scan.completed|backtest_scan.failed|backtest.progress_projection_failed|backtest.completed_projection_failed|data_readiness.projection_failed';

function lastRun(metric: string): string {
  return `max by (${CONFIGURATION}) (trading_bot_research_backtesting_${metric})`;
}

function unit(field: string, value: string): Record<string, unknown> {
  return { matcher: { id: 'byName', options: field }, properties: [{ id: 'unit', value }] };
}

export const tradingBotPipeline: DashboardSpec = {
  uid: 'trading-bot-pipeline',
  title: 'trading-bot pipeline',
  description:
    'Not a funnel: nobody is being carried from one step to the next, and nothing here is a conversion. It is a pipeline, and each stage is measured on its own — stored history replayed into signals, signals turned into simulated trades, backtests scored and their results projected back into the control plane, promotions traded in paper or in earnest, all of it under one Binance weight budget. trading-bot is local only today: it has no deploy and no production scrape job, so the deploy annotation never fires and every panel goes flat when the local stack is down. The trade and last-run panels come from trading-bot#167 and stay empty until it merges; the run counters, the weight budget, the mode and the projections read today.',
  folder: BUSINESS,
  tags: ['trading-bot', 'backtests'],
  time: { from: 'now-7d', to: 'now' },
  refresh: '5m',
  deploys: deploys(JOBS),
  rows: [
    [
      stat('Backtests · 7 days', 'Backtest requests that finished, whatever came of them. A zero week means the data-readiness trigger never fired, not that the strategies are idle.', { w: 4, h: 5 }, [
        prom('sum(increase(trading_bot_research_backtesting_runs_total[7d])) or vector(0)', { legend: 'runs' }),
      ], { decimals: 0 }),
      stat('Backtests that failed · 7 days', 'Runs that ended in an error instead of a score. Each one is a configuration nobody learned anything about; the reason is in the log at the bottom.', { w: 4, h: 5 }, [
        prom('sum(increase(trading_bot_research_backtesting_runs_total{outcome="error"}[7d])) or vector(0)', { legend: 'failed' }),
      ], { decimals: 0, steps: under(1) }),
      stat('Signals emitted · 7 days', 'Entry signals the strategies raised while replaying history. This is the raw output of the pipeline before any risk rule has had a say.', { w: 4, h: 5 }, [
        prom('sum(increase(trading_bot_research_backtesting_emitted_signals_total[7d])) or vector(0)', { legend: 'signals' }),
      ], { decimals: 0 }),
      stat('Simulated trades · 7 days', 'Trades those signals actually opened and closed. The gap to the signals is everything the risk profile threw away.', { w: 4, h: 5 }, [
        prom('sum(increase(trading_bot_research_backtesting_simulated_trades_total[7d])) or vector(0)', { legend: 'trades' }),
      ], { decimals: 0 }),
      stat('Signals per simulated trade · 7 days', 'How many signals it took to get one trade. Near 1 the risk rules are waving almost everything through; climbing into double figures they are rejecting nearly everything, and the strategy is being tested on a handful of trades whose score means little.', { w: 4, h: 5 }, [
        prom('sum(increase(trading_bot_research_backtesting_emitted_signals_total[7d])) / sum(increase(trading_bot_research_backtesting_simulated_trades_total[7d]))', { legend: 'signals per trade' }),
      ], { decimals: 1, steps: under(10) }),
      gauge('Binance weight used', 'Request weight spent in the last minute against the cap Binance enforces. Past the cap Binance bans the IP for minutes at a time and market-data stops feeding everything downstream, so the orange band is the place to slow down. This is a reading of the last scrape rather than a total, so it shows nothing at all while the local stack is down.', { w: 4, h: 5 }, [
        prom('max(trading_bot_market_data_binance_rest_used_weight_1m) / max(trading_bot_market_data_binance_rest_limit_weight_1m)', { legend: 'used' }),
      ], { unit: 'percentunit', min: 0, max: 1, steps: WEIGHT }),
    ],
    [
      timeseries('Backtest runs by outcome', 'Completed runs over time. success and error are the only two outcomes the service reports, and both are created at zero on start, so a gap is silence rather than a missing series.', { w: 8, h: 8 }, [
        prom(`sum by (outcome) (increase(trading_bot_research_backtesting_runs_total[${RATE_INTERVAL}]))`, { legend: '{{outcome}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Replay, signals and trades', 'The three stages of one backtest at the same scale: klines pulled out of ClickHouse, signals raised from them, trades simulated from those. Klines with no signals means the strategy never triggered; signals with no trades means the risk rules refused every one.', { w: 8, h: 8 }, [
        prom(`sum(increase(trading_bot_research_backtesting_replayed_klines_total[${RATE_INTERVAL}]))`, { legend: 'klines replayed' }),
        prom(`sum(increase(trading_bot_research_backtesting_emitted_signals_total[${RATE_INTERVAL}]))`, { legend: 'signals' }),
        prom(`sum(increase(trading_bot_research_backtesting_simulated_trades_total[${RATE_INTERVAL}]))`, { legend: 'simulated trades' }),
      ], { unit: 'short', min: 0, bars: true }),
      stat('Mode', 'paper simulates every fill locally. live places orders on the Binance account with real money, and the trade panels below stop being a rehearsal. Read the whole of this dashboard through this tile, and read it as unknown rather than safe when it is blank: the tile is the last scrape, so it empties whenever execution is not running.', { w: 8, h: 8 }, [
        prom('max(trading_bot_execution_paper_mode_enabled)', { legend: 'mode' }),
      ], { mappings: MODE, steps: atLeast(1), decimals: 0 }),
    ],
    [
      timeseries('Trades opened', `Positions the execution service opened, by side. Long and short should both appear; only one side over a whole range usually means the promoted strategy is one-directional rather than that the other side is broken. ${WAITING_TRADES}`, { w: 8, h: 8 }, [
        prom(`sum by (side) (increase(trading_bot_execution_trades_opened_total[${RATE_INTERVAL}]))`, { legend: '{{side}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Trades closed, by reason', `Why each position ended. takeProfit is the plan working; a wall of stopLoss or riskExit says the promoted configuration is wrong for the market it is trading, and reversal means the strategy changed its mind rather than the levels being hit. ${WAITING_TRADES}`, { w: 8, h: 8 }, [
        prom(`sum by (close_reason) (increase(trading_bot_execution_trades_closed_total[${RATE_INTERVAL}]))`, { legend: '{{close_reason}}' }),
      ], { unit: 'short', min: 0, stack: true, bars: true }),
      timeseries('Binance weight against its cap', 'Weight spent, the self-imposed target market-data throttles itself to, and the hard cap Binance enforces. The used line riding the target is the limiter doing its job; used crossing the limit is a ban, and every stage of this pipeline goes quiet behind it.', { w: 8, h: 8 }, [
        prom('max(trading_bot_market_data_binance_rest_used_weight_1m)', { legend: 'used' }),
        prom('max(trading_bot_market_data_binance_rest_target_weight_1m)', { legend: 'target' }),
        prom('max(trading_bot_market_data_binance_rest_limit_weight_1m)', { legend: 'cap' }),
      ], { unit: 'short', min: 0 }),
    ],
    [
      table('The last backtest of each configuration', `One row per strategy, pair, timeframe and risk profile, holding only its most recent run — rerunning a configuration replaces its row instead of adding one, so this is a standings table and never a history. Sorted by the promotion score, which is what decides whether a configuration is ever traded. A high score on a handful of trades is worth less than the number suggests; read it against the signals-per-trade tile. ${WAITING_RUNS}`, { w: 12, h: 9 }, [
        prom(lastRun('last_run_score'), { instant: true, table: true }),
        prom(lastRun('last_run_win_rate'), { instant: true, table: true }),
        prom(lastRun('last_run_total_pnl_percent'), { instant: true, table: true }),
        prom(lastRun('last_run_max_drawdown_percent'), { instant: true, table: true }),
      ], {
        decimals: 2,
        merge: true,
        hide: ['Time'],
        rename: {
          strategy_name: 'Strategy',
          pair_code: 'Pair',
          timeframe_code: 'Timeframe',
          risk_profile_name: 'Risk profile',
          'Value #A': 'Score',
          'Value #B': 'Win rate',
          'Value #C': 'Total PnL',
          'Value #D': 'Max drawdown',
        },
        sortBy: 'Score',
        overrides: [unit('Win rate', 'percentunit'), unit('Total PnL', 'percent'), unit('Max drawdown', 'percent')],
      }),
      timeseries('Backtest results that never reached the control plane', 'A finished backtest whose result the control plane could not write down: the run cost its full replay and left nothing behind, and the job sits at whatever progress it last recorded. This reads today and it is not flat — backtest_progress is failing more often than it lands, because a fractional progress percent is handed to an integer column and dies there. That is the bug trading-bot#167 fixes, and this panel is how you tell whether the fix took: once it merges the failed streams should fall to nothing.', { w: 6, h: 9 }, [
        prom(`sum by (stream) (increase(trading_bot_control_plane_projections_total{outcome="failed"}[${RATE_INTERVAL}]))`, { legend: '{{stream}}' }),
      ], { unit: 'short', min: 0, bars: true }),
      timeseries('Backtest results the cap threw away', `Results dropped because the service is already tracking the 2,048 configurations it is willing to export. Anything above that line is scored and then forgotten, so the table to the left is no longer the whole picture. ${WAITING_RUNS}`, { w: 6, h: 9 }, [
        prom(`sum(increase(trading_bot_research_backtesting_last_run_configurations_dropped_total[${RATE_INTERVAL}]))`, { legend: 'dropped' }),
      ], { unit: 'short', min: 0, bars: true }),
    ],
    [
      logs('Backtests and the projections behind them', 'Each scan, each batch, each run that failed, and every result the control plane could not write down, newest first. A projection failure here names the job it belongs to, which is how you find out which backtest lost its progress. This reads today.', { w: 24, h: 10 }, [
        loki(`{app=~"trading-bot-research-backtesting|trading-bot-control-plane"} | json | event=~"${PIPELINE_LOG}"`),
      ]),
    ],
  ],
};
