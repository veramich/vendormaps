import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { getAuth, createUserWithEmailAndPassword } from "firebase/auth";

export default function CreateAccountPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const navigate = useNavigate();

    async function createAccount() {
        if (password !== confirmPassword) {
            setError('Passwords do not match.');
            return;
        }
        try {
            await createUserWithEmailAndPassword(getAuth(), email, password);
            navigate('/');
        } catch (error) {
            setError('Failed to create account. Please check your email and password and try again.');
        }
    }

    return (
        <>
            <h1>Create Account</h1>
            {error && <p>{error}</p>}
            <input
                type='email'
                placeholder='Your email'
                value={email}
                onChange={e => setEmail(e.target.value)}/>
            <input 
                placeholder='Your password' 
                type='password' 
                value={password}
                onChange={e => setPassword(e.target.value)}/>
            <input 
                placeholder='Confirm your password' 
                type='password' 
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}/>
            <button onClick={createAccount}>Create Account</button>
            <Link to='/login'>Already have an account? Log in here.</Link>
        </>
    );
}