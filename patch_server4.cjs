const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

const targetCheck = `       if (!order) return res.status(404).json({ error: "Order not found" });
       
       // Force SUCCESS state transition bypassing standard provider webhook`;

const replaceCheck = `       if (!order) return res.status(404).json({ error: "Order not found" });
       
       if (order.userId !== user.id) {
          return res.status(403).json({ error: "Not authorized to simulate this order" });
       }
       
       // Force SUCCESS state transition bypassing standard provider webhook`;

if (code.includes(targetCheck)) {
  code = code.replace(targetCheck, replaceCheck);
  fs.writeFileSync('server.ts', code);
  console.log("server.ts ownership check patched");
} else {
  console.log("server.ts ownership target not found");
}
