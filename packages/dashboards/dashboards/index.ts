import type { DashboardSpec } from '../lib/model.ts';
import { cvFunnel } from './cv-funnel.ts';
import { emailDelivery } from './email-delivery.ts';
import { estateOverview } from './estate-overview.ts';
import { platformEdge } from './platform-edge.ts';
import { platformHost } from './platform-host.ts';
import { platformStack } from './platform-stack.ts';
import { rumCv } from './rum-cv.ts';
import { rumKini } from './rum-kini.ts';
import { rumOverview } from './rum-overview.ts';
import { serviceCvWeb } from './service-cv-web.ts';
import { serviceKiniApi } from './service-kini-api.ts';
import { serviceKiniWeb } from './service-kini-web.ts';
import { serviceNotificationsApi } from './service-notifications-api.ts';
import { serviceOverview } from './service-overview.ts';
import { sloOverview } from './slo-overview.ts';

export const DASHBOARDS: DashboardSpec[] = [
  estateOverview,
  sloOverview,
  serviceOverview,
  serviceCvWeb,
  serviceKiniApi,
  serviceKiniWeb,
  serviceNotificationsApi,
  rumOverview,
  rumCv,
  rumKini,
  cvFunnel,
  emailDelivery,
  platformHost,
  platformEdge,
  platformStack,
];
