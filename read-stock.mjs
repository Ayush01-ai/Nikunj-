import https from 'https';

const projectId = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID;
const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET;
const apiVersion = process.env.NEXT_PUBLIC_SANITY_API_VERSION?.replace(/^v/, '') || '2024-01-01';
const token = process.env.SANITY_API_TOKEN;

// Broad Read-Only GROQ query to find ANY document that handles inventory or options
const query = encodeURIComponent(`*[
  _type == "product" || defined(sizes) || defined(stock) || defined(stockQuantity)
][0...3]{
  _id,
  _type,
  title,
  name,
  stockQuantity,
  stock,
  "sizes": sizes[]{
    size,
    name,
    stockQuantity,
    stock,
    price
  }
}`);

const url = `https://${projectId}.api.sanity.io/v${apiVersion}/data/query/${dataset}?query=${query}`;

console.log(`🔍 Securely fetching sample product structure from Sanity...`);

https.get(url, {
  headers: {
    'Authorization': `Bearer ${token}`
  }
}, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    if (res.statusCode !== 200) {
      console.error(`❌ Error: HTTP ${res.statusCode} from Sanity`);
      console.error(data);
      return;
    }
    const parsed = JSON.parse(data);
    console.log("\n✅ --- LIVE STOCK RESULT --- ✅\n");
    console.log(JSON.stringify(parsed.result, null, 2));
  });
}).on('error', err => {
  console.error("❌ Request failed:", err.message);
});
