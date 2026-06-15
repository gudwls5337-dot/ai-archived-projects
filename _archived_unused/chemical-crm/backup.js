const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const p = new PrismaClient();

async function main() {
  const data = {
    leads: await p.lead.findMany(),
    mailLogs: await p.mailLog.findMany(),
    sequences: await p.sequence.findMany(),
    sequenceSteps: await p.sequenceStep.findMany(),
  };
  fs.writeFileSync('backup.json', JSON.stringify(data, null, 2));
  console.log('backup.json 저장 완료');
  console.log(`leads: ${data.leads.length}건, mailLogs: ${data.mailLogs.length}건, sequences: ${data.sequences.length}건, sequenceSteps: ${data.sequenceSteps.length}건`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
