import type { DashboardSpec } from '../lib/model.ts';
import { cvFunnel } from './cv-funnel.ts';
import { emailDelivery } from './email-delivery.ts';
import { estateOverview } from './estate-overview.ts';
import { gpoolFunnel } from './gpool-funnel.ts';
import { platformEdge } from './platform-edge.ts';
import { platformHost } from './platform-host.ts';
import { platformStack } from './platform-stack.ts';
import { rumCv } from './rum-cv.ts';
import { rumGpool } from './rum-gpool.ts';
import { rumKini } from './rum-kini.ts';
import { rumOverview } from './rum-overview.ts';
import { rumTradingBotOperatorConsole } from './rum-trading-bot-operator-console.ts';
import { serviceCvWeb } from './service-cv-web.ts';
import { serviceGpoolApi } from './service-gpool-api.ts';
import { serviceGpoolWeb } from './service-gpool-web.ts';
import { serviceKiniApi } from './service-kini-api.ts';
import { serviceKiniWeb } from './service-kini-web.ts';
import { serviceNotificationsApi } from './service-notifications-api.ts';
import { serviceOverview } from './service-overview.ts';
import { serviceSityWeb } from './service-sity-web.ts';
import { serviceTradingBotControlPlane } from './service-trading-bot-control-plane.ts';
import { serviceTradingBotExecution } from './service-trading-bot-execution.ts';
import { serviceTradingBotMarketData } from './service-trading-bot-market-data.ts';
import { serviceTradingBotOperatorConsole } from './service-trading-bot-operator-console.ts';
import { serviceTradingBotResearchBacktesting } from './service-trading-bot-research-backtesting.ts';
import { sloOverview } from './slo-overview.ts';

export const DASHBOARDS: DashboardSpec[] = [
  estateOverview,
  sloOverview,
  serviceOverview,
  serviceCvWeb,
  serviceGpoolApi,
  serviceGpoolWeb,
  serviceKiniApi,
  serviceKiniWeb,
  serviceNotificationsApi,
  serviceSityWeb,
  serviceTradingBotControlPlane,
  serviceTradingBotOperatorConsole,
  serviceTradingBotMarketData,
  serviceTradingBotExecution,
  serviceTradingBotResearchBacktesting,
  rumOverview,
  rumCv,
  rumGpool,
  rumKini,
  rumTradingBotOperatorConsole,
  cvFunnel,
  gpoolFunnel,
  emailDelivery,
  platformHost,
  platformEdge,
  platformStack,
];
