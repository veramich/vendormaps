import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";

export default function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    async function logIn() {
        try {
            await signInWithEmailAndPassword(getAuth(), email, password);
            navigate('/');
        } catch (error) {
            setError('Failed to log in. Please check your email and password and try again.');
        }
    }

    return (
        <>
            <h1>Login</h1>
            {error && <p>{error}</p>}
            <input
                type='email'
                placeholder='Your email'
                value={email}
                onChange={e => setEmail(e.target.value)}
            />
            <input 
                placeholder='Your password' 
                type='password' 
                value={password}
                onChange={e => setPassword(e.target.value)}
            />
            <button onClick={logIn}>Log In</button>
            <Link to='/create-account'>Don't have an account? Create one here.</Link>
        </>
    );
}