import { Link } from 'react-router-dom';

export default function NavBar() {
    return (
        <nav>
            <ul>
                <li><Link to="/">Home</Link></li>
                <li><Link to="/businesses">Businesses List</Link></li>
                <li><Link to="/add-business">Add Business</Link></li>
                <li><Link to="/profile">User Profile</Link></li>
            </ul>
        </nav>
    )
}