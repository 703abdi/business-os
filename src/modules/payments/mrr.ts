export type MrrMembership = { price: number; status: string; startedAt?: Date; canceledAt?: Date | null };
export type MrrPaymentPlan = { amount: number; frequency: string; status: string; startDate?: Date };

/** Convert any active payment cadence to its monthly recurring equivalent. */
export function monthlyPlanMrr(plan: Pick<MrrPaymentPlan, "amount" | "frequency">) {
  if (plan.frequency === "weekly") return plan.amount * 4.33;
  if (plan.frequency === "biweekly") return plan.amount * 2;
  return plan.amount;
}

/** The one MRR definition used across the dashboard: active memberships + active payment plans. */
export function totalMrr(memberships: MrrMembership[], paymentPlans: MrrPaymentPlan[], at = new Date()) {
  const membershipMrr = memberships
    .filter((membership) => membership.status === "ACTIVE" && (!membership.startedAt || membership.startedAt <= at) && (!membership.canceledAt || membership.canceledAt > at))
    .reduce((sum, membership) => sum + membership.price, 0);
  const paymentPlanMrr = paymentPlans
    .filter((plan) => plan.status === "ACTIVE" && (!plan.startDate || plan.startDate <= at))
    .reduce((sum, plan) => sum + monthlyPlanMrr(plan), 0);
  return Math.round(membershipMrr + paymentPlanMrr);
}
