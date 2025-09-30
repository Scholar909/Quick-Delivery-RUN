// api/resolve.js

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Only POST allowed" });
  }

  try {
    const { account_number, bank_code } = req.body;

    if (!account_number || !bank_code) {
      return res.status(400).json({ status: "error", message: "Missing parameters" });
    }

    // Secret key comes from environment variable
    const secretKey = process.env.FLW_SECRET_KEY;

    const fwRes = await fetch("https://api.flutterwave.com/v3/accounts/resolve", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${secretKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        account_number,
        account_bank: bank_code
      })
    });

    const data = await fwRes.json();
    return res.status(200).json(data);

  } catch (err) {
    console.error("Error resolving:", err);
    return res.status(500).json({ status: "error", message: "Internal server error" });
  }
}
