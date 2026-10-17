import Header from './components/Header'
import Footer from './components/Footer'
import Survey from './components/Survey'
import Demo from './components/Demo'
import './App.css'

function App() {
  const params = new URLSearchParams(window.location.search)
  const token = params.get('token')
  const onSurvey = window.location.pathname === '/survey'

  return (
    <>
      <Header />
      <main>{onSurvey ? <Survey token={token} /> : <Demo />}</main>
      <Footer />
    </>
  )
}

export default App
