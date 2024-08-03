import React, { useState, useEffect } from 'react';
import { View, Button, StyleSheet, Alert, AppState, AppStateStatus } from 'react-native';
import AppointmentManager from './AppointmentManager'; // Assuming the AppointmentManager file is in the same directory

const App: React.FC = () => {
    const [isRecording, setIsRecording] = useState(false);
    const [isPaused, setIsPaused] = useState(false);

    useEffect(() => {
        // Set the pause callback in AppointmentManager
        AppointmentManager.setPauseCallback(setIsPaused);
    }, []);

    const handleStartRecording = async () => {
        console.log(">>> start recording");
        try {
            await AppointmentManager.startRecording("appointmentId"); // Provide a valid appointment ID
            setIsRecording(true);
            setIsPaused(false);
        } catch (error: any) {
            console.error(error);
            Alert.alert('Error', error.message ?? 'Failed to start recording');
        }
    };

    const handlePauseRecording = async () => {
        try {
            await AppointmentManager.pauseRecording();
            setIsPaused(true);
        } catch (error: any) {
            Alert.alert('Error', error.message ?? 'Failed to pause recording');
        }
    };

    const handleResumeRecording = async () => {
        try {
            await AppointmentManager.resumeRecording();
            setIsPaused(false);
        } catch (error: any) {
            Alert.alert('Error', error.message ?? 'Failed to resume recording');
        }
    };

	useEffect(() => {
	
		const subscription = AppState.addEventListener('change', handleAppStateChange);
		return () => {
		  subscription.remove();
		};
	  }, []);

    const handleStopRecording = async () => {
        try {
            const success = await AppointmentManager.stopRecording();
            if (success) {
                setIsRecording(false);
                setIsPaused(false);
            }
        } catch (error: any) {
            Alert.alert('Error', error.message ?? 'Failed to stop recording');
        }
    };

	const handleAppStateChange = (nextAppState: AppStateStatus) => {
		if (nextAppState === 'active') {
			console.log('App has come to the foreground!');
		}
	
		if (nextAppState.match(/inactive|background/)) {
			console.log('App is in the background');
		}
	  };

    return (
        <View style={styles.container}>
            {!isRecording ? (
                <Button title="Start Recording" onPress={handleStartRecording} />
            ) : (
                <>
                    <Button title="End Recording" onPress={handleStopRecording} />
                    {isPaused ? (
                        <Button title="Resume Recording" onPress={handleResumeRecording} />
                    ) : (
                        <Button title="Pause Recording" onPress={handlePauseRecording} />
                    )}
                </>
            )}
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-end',
        padding: 20,
        backgroundColor: '#2e2e2e', // Dark grey background
        paddingBottom: 100,
    },
    button: {
        marginVertical: 10,
    },
});

export default App;
