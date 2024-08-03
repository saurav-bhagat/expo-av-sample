import { Audio, InterruptionModeIOS } from 'expo-av';
import { Dispatch, SetStateAction } from 'react';
import { Alert } from 'react-native';

export interface Chunk {
    position: number;
    isLastChunk: boolean;
    uri: string;
    startTime: string;
    endTime: string;
    status: string;
    retryCount: number;
}

export interface Recording {
    id: string;
    startDate: string;
    appointmentId: string;
    endDate: string | null;
    status: string;
    sound: Audio.Sound | null;
    chunks: Chunk[];
    chunkCounter: number;
}

const MAX_CHUNK_DURATION_MS = 15 * 1000; // 10 seconds

class AppointmentManager {
    private static instance: AppointmentManager;
    private currentRecording: Audio.Recording | null = null;
    private recordingInterval: NodeJS.Timeout | null = null;
    private isRecordingPaused: boolean = false;
    private pauseCallback: (Dispatch<SetStateAction<boolean>>) | null = null;
    private recordingInterruptionTimeout: NodeJS.Timeout | null = null;

    private constructor() {}

    public static getInstance(): AppointmentManager {
        if (!AppointmentManager.instance) {
            AppointmentManager.instance = new AppointmentManager();
        }
        return AppointmentManager.instance;
    }

    public setPauseCallback(callback: Dispatch<SetStateAction<boolean>>) {
        this.pauseCallback = callback;
    }

    private async requestPermissions() {
        try {
            const { status } = await Audio.getPermissionsAsync();
            if (status !== 'granted') {
                await Audio.requestPermissionsAsync();
            }
        } catch (error: any) {
            console.error('Error in requesting permissions: ', error);
        }
    }

    private async setAudioMode() {
        await Audio.setAudioModeAsync({
            allowsRecordingIOS: true,
            playsInSilentModeIOS: true,
            interruptionModeIOS: InterruptionModeIOS.MixWithOthers,
            staysActiveInBackground: true,
            interruptionModeAndroid: 1,
            shouldDuckAndroid: true,
            playThroughEarpieceAndroid: true,
        });
    }

    private async pauseRecordingInInterruption() {
        if (this.pauseCallback && !this.isRecordingPaused) {
            await this.currentRecording?.pauseAsync();
            this.isRecordingPaused = true;
            this.pauseCallback(true);
        }
    }

    private async startAudioRecording() {
        const currentRecordingStatus = await this.currentRecording?.getStatusAsync();
        console.log("currentRecordingStatus", JSON.stringify(currentRecordingStatus));
        const handleRecordingStatusUpdate = async (status: Audio.RecordingStatus) => {
            if (status.isRecording) {
                console.log('Recording is in progress...');
                if (this.recordingInterruptionTimeout) {
                    clearTimeout(this.recordingInterruptionTimeout);
                    this.recordingInterruptionTimeout = null;
                }
            } else if (status.isDoneRecording) {
                console.log('Recording is done...');
            } else if (status.mediaServicesDidReset) {
                console.log('Media services reset...');
                if (this.currentRecording) {
                    this.stopRecording();
                }
            } else if (!status?.isRecording && !status?.mediaServicesDidReset && status?.durationMillis === 0) {
                console.log('Recording stopped unexpectedly...');
                if (!this.recordingInterruptionTimeout && !this.isRecordingPaused) {
                    this.recordingInterruptionTimeout = setTimeout(() => {
                        this.pauseRecordingInInterruption();
                        clearTimeout(this.recordingInterruptionTimeout!);

                        // clear the interval to create chunk as interruption happened
                        // reset when recording is resumed
                        this.recordingInterval && clearInterval(this.recordingInterval);
                        this.recordingInterval = null;

                        this.recordingInterruptionTimeout = null;
                    }, 5000);
                }
            }
        };

        try {
            await this.setAudioMode();
            const { recording, status } = await Audio.Recording.createAsync(
                Audio.RecordingOptionsPresets.HIGH_QUALITY,
                handleRecordingStatusUpdate
            );
            this.isRecordingPaused = false;
            this.currentRecording = recording;
            return { recording, status };
        } catch (error) {
            console.error('Error in starting audio recording: ', error);
            throw error;
        }
    }

    private async stopAndUnloadRecording(recording: Audio.Recording | null) {
        if (recording) {
            await recording.stopAndUnloadAsync();
            await Audio.setAudioModeAsync({
                allowsRecordingIOS: false,
            });
        }
    }

    private async handleRecordingUri(recording: Audio.Recording | null) {
        if (recording) {
            try {
                const recordingUri = recording.getURI();
                if (recordingUri) {
                    return recordingUri;
                } else {
                    console.error('No recording URI found');
                }
            } catch (error: any) {
                console.error('Error in getting recording URI: ', error);
                throw new Error('Recording URI not found');
            }
        }
        return null;
    }

    public async handleChunkCreation(isLastChunk: boolean = false) {
        try {
            const status = await this.currentRecording?.getStatusAsync();
            if (this.currentRecording && status?.isRecording && !this.isRecordingPaused) {
                await this.stopAndUnloadRecording(this.currentRecording);
                const localFileUri = await this.handleRecordingUri(this.currentRecording);
                if (localFileUri) {
                    console.log('Chunk created with URI: ', localFileUri);
                    // Handle chunk creation and saving here
                }
                if (!isLastChunk) {
                    const { recording, status } = await this.startAudioRecording();
                    this.currentRecording = recording;
                }
            }
        } catch (error: any) {
            console.error('Error during chunk creation: ', error.message);
        }
    }

    public async startRecording(appointmentId: string) {
        try {
            await this.requestPermissions();
            await this.setAudioMode();
            const { recording, status } = await this.startAudioRecording();
            this.currentRecording = recording;

            this.recordingInterval = setInterval(async () => {
                try {
                    await this.handleChunkCreation();
                } catch (error) {
                    console.error('Error running handleChunkCreation: ', error);
                }
            }, MAX_CHUNK_DURATION_MS);
        } catch (error: any) {
            console.error('Failed to start recording', error);
            throw new Error(error?.message ?? 'Failed to start recording');
        }
    }

    public async pauseRecording() {
        if (this.currentRecording) {
            try {
                this.isRecordingPaused = true;
                // await this.handleChunkCreation();
                await this.currentRecording.pauseAsync();
                console.log('Recording paused...');


                // clear the interval to create chunk as we are pausing the recording
                if(this.recordingInterval) {
                    clearInterval(this.recordingInterval);
                    this.recordingInterval = null;
                }

            } catch (error: any) {
                console.error('Failed to pause recording:', error);
                throw new Error(error?.message ?? 'Failed to pause recording');
            }
        }
    }

    public async resumeRecording() {
        if (this.currentRecording) {
            try {
                // const { recording, status } = await this.startAudioRecording();
                // this.currentRecording = recording;
                await this.currentRecording.startAsync();
                this.isRecordingPaused = false;
                console.log('Recording resumed...');

                // resume the interval to create chunk as we stopped it when we got the interruption and on pause
                if(!this.recordingInterval) {
                    this.recordingInterval = setInterval(async () => {
                        try {
                            await this.handleChunkCreation();
                        } catch (error) {
                            console.error('Error running handleChunkCreation: ', error);
                        }
                    }, MAX_CHUNK_DURATION_MS);
                }


            } catch (error) {
                console.error('Failed to resume recording:', error);
            }
        }
    }

    public async stopRecording() {
        try {
            const currentRecordingStatus = await this.currentRecording?.getStatusAsync();
            if (!currentRecordingStatus?.isRecording) {
                Alert.alert('Please resume the recording to end it');
                return false;
            }

            if (this.recordingInterval) {
                clearInterval(this.recordingInterval);
                this.recordingInterval = null;
            }

            await this.handleChunkCreation(true);
            this.currentRecording = null;
            return true;
        } catch (error: any) {
            console.error('Error during stopping recording: ', error.message);
            this.currentRecording = null;
            throw new Error(error?.message ?? 'Failed to stop recording');
        }
    }
}

export default AppointmentManager.getInstance();
