import { PageLoadingShell } from '@/components/PageLoadingShell';

export default function PlanDetailRouteLoading() {
  return <PageLoadingShell title="训练计划" backHref="/plans" maxWidth="3xl" variant="plans" />;
}
