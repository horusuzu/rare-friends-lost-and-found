import {useEffect} from 'react';import type {GameComponentProps} from '@rarefriends/friendsdk/runtime';
export default function Game({client}:GameComponentProps){useEffect(()=>{void client.read();},[client]);return <p>Arcade loading</p>;}
