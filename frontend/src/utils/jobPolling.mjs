export async function waitForJob(api, path, onUpdate = () => {}, interval = 500) {
  for (;;) {
    const job = await api(path);
    onUpdate(job);
    if (!["queued", "running"].includes(job.status)) {
      if (job.status === "failed") throw new Error(job.message || "任务执行失败");
      return job.result || job;
    }
    if (interval) await new Promise(resolve => setTimeout(resolve, interval));
  }
}
