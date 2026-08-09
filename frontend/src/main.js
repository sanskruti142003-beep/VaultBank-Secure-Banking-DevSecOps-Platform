const result = document.querySelector('#result');
document.querySelector('#check').addEventListener('click', async () => {
  result.textContent = 'Checking...';
  try {
    const res = await fetch('http://localhost:4001/health');
    result.textContent = JSON.stringify(await res.json(), null, 2);
  } catch (err) {
    result.textContent = 'Auth service not reachable: ' + err.message;
  }
});
