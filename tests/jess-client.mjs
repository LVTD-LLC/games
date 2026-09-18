let client = 0;
// Browser fixtures emulate distinct clients behind the trusted ingress. Keep
// production budgets/concurrency guards intact while parallel tests stay isolated.
export async function isolateJessClient({ context }, testInfo) {
  if (!process.env.BASE_URL)
    await context.setExtraHTTPHeaders({
      'X-Forwarded-For': `198.18.${testInfo.workerIndex}.${++client}`,
    });
}
