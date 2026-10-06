function asInteger(value, fallback = 0) {
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : fallback;
}

function overageCount(actual, included) {
  return Math.max(0, asInteger(actual) - Math.max(0, asInteger(included)));
}

function clampPercent(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.min(100, Math.max(0, number)) : 0;
}

function calculateInvoiceAmounts({ subscription, plan, rules, studentCount = 0, teacherCount = 0, studentRevenueCents = 0, overdueDays = 0 }) {
  const annual = subscription.billingPeriod === 'annual';
  const studentSubscription = subscription.accountRole === 'student';
  const baseCents = Math.max(0, asInteger(studentSubscription
    ? annual ? plan.studentAnnualPriceCents : plan.studentMonthlyPriceCents
    : annual ? plan.annualPriceCents : plan.monthlyPriceCents));
  const extraStudentCount = studentSubscription ? 0 : overageCount(studentCount, plan.includedStudents);
  const extraTeacherCount = studentSubscription ? 0 : overageCount(teacherCount, plan.includedTeachers);
  const extraStudentCents = extraStudentCount * Math.max(0, asInteger(plan.extraStudentPriceCents));
  const extraTeacherCents = extraTeacherCount * Math.max(0, asInteger(plan.extraTeacherPriceCents));
  const revenue = Math.max(0, asInteger(studentRevenueCents));
  const feePercent = clampPercent(plan.platformFeePercent ?? rules.platformFeePercent);
  const platformFeeCents = Math.round(revenue * feePercent / 100);
  const grossSubscriptionCents = baseCents + extraStudentCents + extraTeacherCents;
  const configuredDiscountCents = Math.round(grossSubscriptionCents * clampPercent(plan.discountPercent) / 100);
  const discountCents = Math.min(grossSubscriptionCents, configuredDiscountCents + Math.max(0, asInteger(plan.discountCents)) + Math.max(0, asInteger(subscription.discountCents)));
  const lateFeePercent = clampPercent(rules.lateFeePercent);
  const dailyInterestPercent = Math.max(0, Number(rules.dailyInterestPercent) || 0);
  const daysOverdue = Math.max(0, asInteger(overdueDays));
  const feeBaseCents = Math.max(0, baseCents + extraStudentCents + extraTeacherCents + platformFeeCents - discountCents);
  const lateFeeCents = daysOverdue ? Math.round(feeBaseCents * lateFeePercent / 100) : 0;
  const interestCents = Math.round(feeBaseCents * dailyInterestPercent / 100 * daysOverdue);
  const beforeOffsetCents = feeBaseCents + lateFeeCents + interestCents;
  const offsetAllowed = !studentSubscription && (plan.allowStudentRevenueOffset === true || rules.allowStudentRevenueOffset === true);
  const offsetPercent = clampPercent(plan.allowStudentRevenueOffset ? plan.offsetPercent : rules.offsetPercent);
  const uncappedOffsetCents = offsetAllowed ? Math.floor(revenue * offsetPercent / 100) : 0;
  const capCandidates = [plan.offsetCapCents, rules.offsetCapCents].filter((value) => value !== null && value !== undefined).map((value) => Math.max(0, asInteger(value)));
  const offsetCapCents = capCandidates.length ? Math.min(...capCandidates) : null;
  const cappedOffsetCents = offsetCapCents === null ? uncappedOffsetCents : Math.min(uncappedOffsetCents, offsetCapCents);
  const appliedOffsetCents = Math.min(beforeOffsetCents, cappedOffsetCents);
  const finalAmountCents = Math.max(0, beforeOffsetCents - appliedOffsetCents);
  const creditCents = rules.creditCarryover === true ? Math.max(0, cappedOffsetCents - appliedOffsetCents) : 0;

  return {
    baseCents,
    studentCount: studentSubscription ? 0 : Math.max(0, asInteger(studentCount)),
    includedStudents: studentSubscription ? 0 : Math.max(0, asInteger(plan.includedStudents)),
    extraStudentCount,
    extraStudentCents,
    teacherCount: studentSubscription ? 0 : Math.max(0, asInteger(teacherCount)),
    includedTeachers: studentSubscription ? 0 : Math.max(0, asInteger(plan.includedTeachers)),
    extraTeacherCount,
    extraTeacherCents,
    platformFeeCents,
    discountCents,
    lateFeeCents,
    interestCents,
    studentRevenueCents: revenue,
    eligibleOffsetCents: cappedOffsetCents,
    appliedOffsetCents,
    creditCents,
    finalAmountCents,
  };
}

module.exports = { calculateInvoiceAmounts, clampPercent, overageCount };