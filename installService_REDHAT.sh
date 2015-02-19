#!/bin/bash
# kido-agent daemon
# chkconfig: 345 20 80
# description: Kidozen kido-agent daemon
# processname: kido-agent
#

# Path where kido-agent is installed
DAEMON_PATH=process-path
DAEMON_LOG="$DAEMON_PATH/agent.log"

# Full path to node binary
# NODE_BIN="/usr/local/bin/node"
NODE_BIN=node-path
DAEMON="bin/process"
DAEMONOPTS=""

NAME=kido-agent
DESC="Kidozen agent"
PIDFILE=/var/run/$NAME.pid
SCRIPTNAME=/etc/init.d/$NAME

case "$1" in
start)
        if [ -s $PIDFILE ]; then
           printf "%s\n" "kido-agent is already up or pid exists"
           exit 10
        fi
        printf "%-50s" "Starting $NAME..."
        cd $DAEMON_PATH
        PID=`$NODE_BIN $DAEMON $DAEMONOPTS >> $DAEMON_LOG 2>&1 & echo $!`
        if [ -z $PID ]; then
            printf "%s\n" "Fail"
        else
            echo $PID > $PIDFILE
            printf "%s\n" "Ok"
        fi
;;
status)
        printf "%-50s" "Checking $NAME..."
        if [ -f $PIDFILE ]; then
            PID=`cat $PIDFILE`
            if [ -z "`ps axf | grep ${PID} | grep -v grep`" ]; then
                printf "%s\n" "Process dead but pidfile exists"
            else
                echo "Running"
            fi
        else
            printf "%s\n" "Service not running"
        fi
;;
stop)
        printf "%-50s" "Stopping $NAME"
            PID=`cat $PIDFILE`
            cd $DAEMON_PATH
        if [ -f $PIDFILE ]; then
            kill -HUP $PID
            printf "%s\n" "Ok"
            rm -f $PIDFILE
        else
            printf "%s\n" "pidfile not found"
        fi
;;

restart)
        $0 stop
        $0 start
;;

*)
        echo "Usage: $0 {status|start|stop|restart}"
        exit 1
esac
