const BASE_URL = "http:// 192.168.35.241:3000"

export async function createAlert(data){

    const res = await fetch(`${BASE_URL}/alerts`,{
        method:"POST",
        headers:{
            "Content-Type":"application/json"
        },
        body: JSON.stringify(data)
    })

    return res.json()
}

export async function getAlerts(){

    const res = await fetch(`${BASE_URL}/alerts`)

    return res.json()
}

export async function deleteAlert(id){

    const res = await fetch(`${BASE_URL}/alerts/${id}`,{
        method:"DELETE"
    })

    return res.json()
}