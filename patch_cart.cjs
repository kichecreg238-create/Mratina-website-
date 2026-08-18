const fs = require('fs');
let code = fs.readFileSync('src/components/CartSidebar.tsx', 'utf8');

// Add unconfiguredOrderId state
if (!code.includes('unconfiguredOrderId')) {
  code = code.replace(
    "const [checkoutError, setCheckoutError] = useState<string | null>(null);",
    "const [checkoutError, setCheckoutError] = useState<string | null>(null);\n  const [unconfiguredOrderId, setUnconfiguredOrderId] = useState<number | null>(null);"
  );
}

// Replace handleCheckout section
const targetHandle = `      if (!payData.isConfigured) {
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

const replacementHandle = `      if (!payData.isConfigured) {
        // Provider is not configured.
        setUnconfiguredOrderId(orderId);
        setCheckoutError('Payment provider unconfigured. Development mode available.');
        setCheckingOut(false);
        return;
      } else if (!payData.success) {
        setCheckoutError(payData.error || 'Payment initiation failed.');
        setCheckingOut(false);
        return;
      } else {
        alert(\`Order #\${orderId} created! Please check your phone for the payment prompt.\`);
      }

      useCartStore.getState().clearCart();
      toggleCart();`;

if (code.includes(targetHandle)) {
  code = code.replace(targetHandle, replacementHandle);
}

// Add handleDevSimulate
const targetFuncInsert = "  const handleCheckout = async () => {";
const handleDevSimulateStr = `  const handleDevSimulate = async () => {
    if (!unconfiguredOrderId) return;
    setCheckingOut(true);
    setCheckoutError(null);
    try {
      const token = await user!.getIdToken();
      const res = await fetch('/api/dev/simulate-payment', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': \`Bearer \${token}\`
        },
        body: JSON.stringify({ orderId: unconfiguredOrderId, provider: 'M-PESA' })
      });
      const data = await res.json();
      if (data.success) {
        alert(\`DEVELOPMENT SIMULATION SUCCESSFUL.\\n\\nOrder #\${unconfiguredOrderId} marked as paid.\`);
        useCartStore.getState().clearCart();
        toggleCart();
        setUnconfiguredOrderId(null);
      } else {
        setCheckoutError(data.error || 'Simulation failed');
      }
    } catch (e) {
       setCheckoutError('Simulation request failed.');
    } finally {
       setCheckingOut(false);
    }
  };

`;

if (!code.includes('handleDevSimulate')) {
  code = code.replace(targetFuncInsert, handleDevSimulateStr + targetFuncInsert);
}

// Add Button to UI
const targetButton = `            <button 
              onClick={step === 'PAYMENT' ? handleCheckout : handleNextStep}
              disabled={checkingOut}
              className="w-full py-4 bg-[#c5a059] hover:bg-[#d4b271] text-[#050505] text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex justify-center items-center gap-2"
            >
              {checkingOut ? 'Processing...' : 
                (step === 'CART' ? (user ? 'Proceed to Delivery' : 'Sign In to Checkout') : 
                (step === 'DELIVERY' ? 'Proceed to Payment' : \`Pay KES \${finalTotal.toLocaleString()}\`))}
            </button>`;

const replacementButton = targetButton + `
            {unconfiguredOrderId && (
              <button 
                onClick={handleDevSimulate}
                disabled={checkingOut}
                className="w-full py-4 mt-2 bg-transparent border border-dashed border-[#c5a059] hover:bg-[#c5a059]/10 text-[#c5a059] text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex justify-center items-center gap-2"
              >
                {checkingOut ? 'Simulating...' : 'TRIGGER DEV SIMULATION'}
              </button>
            )}`;

if (!code.includes('TRIGGER DEV SIMULATION') && code.includes(targetButton)) {
  code = code.replace(targetButton, replacementButton);
}

fs.writeFileSync('src/components/CartSidebar.tsx', code);
console.log('CartSidebar updated');
