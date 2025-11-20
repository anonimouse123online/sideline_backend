// src/api/signup.js
export async function signup(email, password, fullName, phone = "") {
  const [firstName, ...rest] = fullName.split(" ");
  const lastName = rest.join(" ");

  const response = await fetch("https://sideline-backend-9m2p.onrender.com/api/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      firstName,
      lastName,
      email,
      phone,
      password,
    }),
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Signup failed");
  }

  // Store token if available
  if (data.token) {
    localStorage.setItem('token', data.token);
    console.log('✅ Signup token stored');
  } else if (data.accessToken) {
    localStorage.setItem('token', data.accessToken);
    console.log('✅ Signup accessToken stored');
  }

  // Also store user data in localStorage
  if (data.user) {
    localStorage.setItem('user', JSON.stringify(data.user));
    console.log('✅ User data stored');
  }

  return data;
}