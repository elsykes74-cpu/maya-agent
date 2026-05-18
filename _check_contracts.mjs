
try {
  const m = await import('@contracts/constants');
  console.log('Resolved:', JSON.stringify(m));
} catch(e) {
  console.error('Failed:', e.message);
}
