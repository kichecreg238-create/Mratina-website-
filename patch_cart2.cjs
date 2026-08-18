const fs = require('fs');
let code = fs.readFileSync('src/components/CartSidebar.tsx', 'utf8');

// 1. Remove TRIGGER DEV SIMULATION button
const targetButton = `{unconfiguredOrderId && (
              <button 
                onClick={handleDevSimulate}
                disabled={checkingOut}
                className="w-full py-4 mt-2 bg-transparent border border-dashed border-[#c5a059] hover:bg-[#c5a059]/10 text-[#c5a059] text-[10px] font-bold uppercase tracking-[0.2em] transition-colors flex justify-center items-center gap-2"
              >
                {checkingOut ? 'Simulating...' : 'TRIGGER DEV SIMULATION'}
              </button>
            )}`;

if (code.includes(targetButton)) {
  code = code.replace(targetButton, "");
}

// 2. Remove handleDevSimulate function entirely
const funcStart = "  const handleDevSimulate = async () => {";
if (code.includes(funcStart)) {
   const before = code.substring(0, code.indexOf(funcStart));
   const funcEndText = "  };\n\n";
   const funcEnd = code.indexOf(funcEndText, code.indexOf(funcStart)) + funcEndText.length;
   const after = code.substring(funcEnd);
   code = before + after;
}

// 3. Change checkout behavior to just set error without 'Development mode available'
const targetHandle = `      if (!payData.isConfigured) {
        // Provider is not configured.
        setUnconfiguredOrderId(orderId);
        setCheckoutError('Payment provider unconfigured. Development mode available.');
        setCheckingOut(false);
        return;`;

const replaceHandle = `      if (!payData.isConfigured) {
        // Provider is not configured.
        setCheckoutError('Payment provider is not currently configured.');
        setCheckingOut(false);
        return;`;

if (code.includes(targetHandle)) {
  code = code.replace(targetHandle, replaceHandle);
}

// Write file
fs.writeFileSync('src/components/CartSidebar.tsx', code);
console.log('CartSidebar patched');
