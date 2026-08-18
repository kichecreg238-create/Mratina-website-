const fs = require('fs');
let code = fs.readFileSync('src/components/CartSidebar.tsx', 'utf8');

const target = `      const orderId = data.order.id;

      // 2. Simulate M-Pesa Push Webhook (In production, this is triggered externally)
      // We will wait 2 seconds, then hit our own webhook to simulate the payment arriving
      setTimeout(async () => {
        try {
          await fetch('/api/webhooks/payment', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              orderId,
              provider: 'MPESA',
              providerReference: 'RKT87X' + Math.floor(Math.random() * 1000),
              status: 'SUCCESS'
            })
          });
        } catch (e) {
          console.error('Simulated webhook failed', e);
        }
      }, 2000);

      alert(\`Order #\${orderId} created successfully! M-Pesa prompt sent to \${phone}.\`);

      useCartStore.getState().clearCart();
      toggleCart();`;

const replacement = `      const orderId = data.order.id;

      // 2. Initiate Payment through the Payment Engine
      const payRes = await fetch('/api/payments/initiate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({
          orderId,
          provider: 'M-PESA',
          phoneNumber: phone
        })
      });
      
      const payData = await payRes.json();
      
      if (!payData.isConfigured) {
        // Provider is not configured. 
        alert(\`Order #\${orderId} created, but M-Pesa integration is currently unconfigured.\\n\\nTriggering development simulation payment.\`);
        await fetch('/api/dev/simulate-payment', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId, provider: 'M-PESA' })
        });
      } else if (!payData.success) {
        setCheckoutError(payData.error || 'Payment initiation failed.');
        setCheckingOut(false);
        return;
      } else {
        alert(\`Order #\${orderId} created! Please check your phone for the payment prompt.\`);
      }

      useCartStore.getState().clearCart();
      toggleCart();`;

if (code.includes(target)) {
  fs.writeFileSync('src/components/CartSidebar.tsx', code.replace(target, replacement));
  console.log('Success');
} else {
  console.log('Target not found exactly, doing regex');
  const regex = /const orderId = data\.order\.id;[\s\S]*?toggleCart\(\);/;
  if (regex.test(code)) {
      fs.writeFileSync('src/components/CartSidebar.tsx', code.replace(regex, replacement));
      console.log('Success with regex');
  } else {
      console.log('Could not find via regex either');
  }
}
