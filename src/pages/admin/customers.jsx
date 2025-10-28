import { useState, useEffect } from "react";
import { fetchCustomers, blockUser, adjustCredits } from "../../lib/adminApi";

export default function CustomersPage() {
  const [customers, setCustomers] = useState([]);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);

  const perPage = 25;

  const loadCustomers = async (p = page) => {
    setLoading(true);
    try {
      const res = await fetchCustomers(p, perPage);
      setCustomers(res.data);
      setTotal(res.total);
    } catch (err) {
      console.error("Failed to load customers:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCustomers();
  }, [page]);

  const handleBlockToggle = async (clientId, blocked) => {
    const reason = prompt("Reason for change:") || "No reason";
    try {
      await blockUser(clientId, !blocked, reason, "admin");
      loadCustomers();
    } catch (err) {
      console.error("Failed to toggle block:", err);
    }
  };

  const handleAdjustCredits = async (clientId) => {
    const amount = parseInt(
      prompt("Credits to add/subtract (use negative for subtract):"),
      10
    );
    if (isNaN(amount)) return alert("Invalid number");
    try {
      await adjustCredits(clientId, amount, "admin adjustment");
      loadCustomers();
    } catch (err) {
      console.error("Failed to adjust credits:", err);
    }
  };

  const totalPages = Math.ceil(total / perPage);

  return (
    <div style={{ padding: 20 }}>
      <h2>Customers ({total})</h2>
      {loading ? (
        <p>Loading...</p>
      ) : (
        <table
          border="1"
          cellPadding="8"
          style={{ width: "100%", borderCollapse: "collapse" }}
        >
          <thead>
            <tr>
              <th>Client ID</th>
              <th>Phone</th>
              <th>Credits</th>
              <th>Blocked</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.client_id}>
                <td>{c.client_id}</td>
                <td>{c.phone}</td>
                <td>{c.credits}</td>
                <td>{c.blocked ? "Yes" : "No"}</td>
                <td>
                  <button onClick={() => handleBlockToggle(c.client_id, c.blocked)}>
                    {c.blocked ? "Unblock" : "Block"}
                  </button>{" "}
                  <button onClick={() => handleAdjustCredits(c.client_id)}>
                    Adjust Credits
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div style={{ marginTop: 10 }}>
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>
          Prev
        </button>
        <span style={{ margin: "0 10px" }}>
          Page {page} / {totalPages || 1}
        </span>
        <button disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </div>
  );
}
