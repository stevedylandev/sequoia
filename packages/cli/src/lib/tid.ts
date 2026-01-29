// TID (Timestamp Identifier) generation per ATProto spec
// Format: base32-sortable encoded, 13 characters
// Structure: 53 bits of timestamp (microseconds since epoch) + 10 bits of clock ID

const S32_CHAR = "234567abcdefghijklmnopqrstuvwxyz";

let lastTimestamp = 0;
let clockId = Math.floor(Math.random() * 1024);

export function generateTid(): string {
  // Get current timestamp in microseconds
  let timestamp = Date.now() * 1000;

  // Ensure monotonically increasing timestamps
  if (timestamp <= lastTimestamp) {
    timestamp = lastTimestamp + 1;
  }
  lastTimestamp = timestamp;

  // Combine timestamp (53 bits) and clock ID (10 bits)
  // TID is a 63-bit integer encoded as 13 base32 characters
  const tid = (BigInt(timestamp) << 10n) | BigInt(clockId);

  // Convert to base32-sortable
  let result = "";
  let value = tid;
  for (let i = 0; i < 13; i++) {
    result = S32_CHAR[Number(value % 32n)] + result;
    value = value / 32n;
  }

  return result;
}

export function isValidTid(tid: string): boolean {
  if (tid.length !== 13) return false;
  for (const char of tid) {
    if (!S32_CHAR.includes(char)) return false;
  }
  return true;
}
